import type { BirdsShapeTool } from "@/components/birds-toolbar";
import type { RefObject } from "react";
import type { Scene } from "@/hooks/useWebGPU";
import {
  BACKGROUND_VERTEX_COUNT,
  BIRD_COUNT,
  BIRD_VERTEX_COUNT,
  FLOATS_PER_VEC4,
  GPUBufferUsageFlags,
  WORKGROUP_SIZE,
} from "./constants";
import { createFormationTargets } from "./formations";
import {
  birdRenderWGSL,
  computePositionWGSL,
  computeVelocityWGSL,
} from "./shaders";

export interface DisturbanceState {
  x: number;
  y: number;
  strength: number;
}

export interface BirdsControls {
  formationEnabledRef: RefObject<boolean>;
  selectedShapeRef: RefObject<BirdsShapeTool>;
  nameTextRef: RefObject<string>;
  disturbanceRef: RefObject<DisturbanceState>;
  /**
   * Set by the scene at setup time. Lets the parent re-upload the formation
   * target buffer (e.g. when the user submits a new name or picks a new shape).
   */
  uploadFormationTargetsRef: RefObject<
    (shape: BirdsShapeTool, name: string) => void
  >;
}

const UNIFORM_BUFFER_SIZE = 48;
const DISTURBANCE_DECAY_PER_FRAME = 0.84;
const MAX_DELTA_TIME = 0.033;

const seedBirdState = (aspectScale: number) => {
  const positionData = new Float32Array(BIRD_COUNT * FLOATS_PER_VEC4);
  const velocityData = new Float32Array(BIRD_COUNT * FLOATS_PER_VEC4);
  const phaseData = new Float32Array(BIRD_COUNT);

  for (let i = 0; i < BIRD_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(Math.random());
    const x = (Math.random() * 2.3 - 1.15) * radius;
    const y = (Math.random() * 2.1 - 1.05) * aspectScale * radius;
    const speed = 0.12 + Math.random() * 0.34;

    positionData[i * FLOATS_PER_VEC4 + 0] = x;
    positionData[i * FLOATS_PER_VEC4 + 1] = y;
    positionData[i * FLOATS_PER_VEC4 + 2] = 0;
    positionData[i * FLOATS_PER_VEC4 + 3] = Math.random();

    velocityData[i * FLOATS_PER_VEC4 + 0] = Math.cos(angle) * speed;
    velocityData[i * FLOATS_PER_VEC4 + 1] = Math.sin(angle) * speed;
    velocityData[i * FLOATS_PER_VEC4 + 2] = 0;
    velocityData[i * FLOATS_PER_VEC4 + 3] = Math.random();

    phaseData[i] = Math.random() * Math.PI * 2;
  }

  return { positionData, velocityData, phaseData };
};

/**
 * Creates a `Scene` callback compatible with `useWebGPU`. The scene allocates
 * all GPU resources for the bird flock and returns a per-frame render
 * function. State that needs to flow in from React (formation toggle, current
 * shape/name, last disturbance) is read through the `controls` refs each frame.
 */
export const makeBirdsScene = (controls: BirdsControls): Scene => {
  return ({ context, device, presentationFormat, canvas }) => {
    const aspectScale = canvas.height / canvas.width;

    const { positionData, velocityData, phaseData } = seedBirdState(aspectScale);

    const makeStorageBuffer = (data: Float32Array) => {
      const buffer = device.createBuffer({
        size: data.byteLength,
        usage: GPUBufferUsageFlags.STORAGE | GPUBufferUsageFlags.COPY_DST,
      });
      device.queue.writeBuffer(buffer, 0, data as BufferSource);
      return buffer;
    };

    const positionBuffers = [
      makeStorageBuffer(positionData),
      makeStorageBuffer(positionData),
    ];
    const velocityBuffers = [
      makeStorageBuffer(velocityData),
      makeStorageBuffer(velocityData),
    ];
    const phaseBuffers = [
      makeStorageBuffer(phaseData),
      makeStorageBuffer(phaseData),
    ];

    const formationTargetBuffer = makeStorageBuffer(
      createFormationTargets(
        controls.selectedShapeRef.current,
        controls.nameTextRef.current,
        aspectScale,
      ),
    );

    controls.uploadFormationTargetsRef.current = (
      nextShape: BirdsShapeTool,
      nextName: string,
    ) => {
      device.queue.writeBuffer(
        formationTargetBuffer,
        0,
        createFormationTargets(nextShape, nextName, aspectScale) as BufferSource,
      );
    };

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsageFlags.UNIFORM | GPUBufferUsageFlags.COPY_DST,
    });

    const renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: device.createShaderModule({ code: birdRenderWGSL }),
        entryPoint: "vertexMain",
      },
      fragment: {
        module: device.createShaderModule({ code: birdRenderWGSL }),
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: { topology: "triangle-list" },
    });

    const velocityPipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: computeVelocityWGSL }),
        entryPoint: "main",
      },
    });

    const positionPipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: device.createShaderModule({ code: computePositionWGSL }),
        entryPoint: "main",
      },
    });

    const makeVelocityBindGroup = (readIndex: number, writeIndex: number) =>
      device.createBindGroup({
        layout: velocityPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: positionBuffers[readIndex] } },
          { binding: 2, resource: { buffer: velocityBuffers[readIndex] } },
          { binding: 3, resource: { buffer: velocityBuffers[writeIndex] } },
          { binding: 4, resource: { buffer: formationTargetBuffer } },
        ],
      });

    const makePositionBindGroup = (readIndex: number, writeIndex: number) =>
      device.createBindGroup({
        layout: positionPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: positionBuffers[readIndex] } },
          { binding: 2, resource: { buffer: velocityBuffers[writeIndex] } },
          { binding: 3, resource: { buffer: phaseBuffers[readIndex] } },
          { binding: 4, resource: { buffer: positionBuffers[writeIndex] } },
          { binding: 5, resource: { buffer: phaseBuffers[writeIndex] } },
        ],
      });

    const makeRenderBindGroup = (readIndex: number) =>
      device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: positionBuffers[readIndex] } },
          { binding: 2, resource: { buffer: velocityBuffers[readIndex] } },
          { binding: 3, resource: { buffer: phaseBuffers[readIndex] } },
        ],
      });

    const velocityBindGroups = [
      makeVelocityBindGroup(0, 1),
      makeVelocityBindGroup(1, 0),
    ];
    const positionBindGroups = [
      makePositionBindGroup(0, 1),
      makePositionBindGroup(1, 0),
    ];
    const renderBindGroups = [makeRenderBindGroup(0), makeRenderBindGroup(1)];

    const workgroups = Math.ceil(BIRD_COUNT / WORKGROUP_SIZE);
    let stateIndex = 0;
    let lastTime = Date.now();

    return (time: number) => {
      const deltaTime = Math.min((time - lastTime) / 1000, MAX_DELTA_TIME);
      lastTime = time;

      const writeIndex = 1 - stateIndex;

      const disturbance = controls.disturbanceRef.current;
      disturbance.strength *= Math.pow(DISTURBANCE_DECAY_PER_FRAME, deltaTime * 60);

      device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array([
          aspectScale,
          time,
          deltaTime,
          0,
          disturbance.x,
          disturbance.y,
          disturbance.strength,
          0,
          controls.formationEnabledRef.current ? 1 : 0,
          0,
          0,
          0,
        ]) as BufferSource,
      );

      const commandEncoder = device.createCommandEncoder();

      const velocityPass = commandEncoder.beginComputePass();
      velocityPass.setPipeline(velocityPipeline);
      velocityPass.setBindGroup(0, velocityBindGroups[stateIndex]);
      velocityPass.dispatchWorkgroups(workgroups);
      velocityPass.end();

      const positionPass = commandEncoder.beginComputePass();
      positionPass.setPipeline(positionPipeline);
      positionPass.setBindGroup(0, positionBindGroups[stateIndex]);
      positionPass.dispatchWorkgroups(workgroups);
      positionPass.end();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.72, g: 0.7, b: 0.98, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, renderBindGroups[writeIndex]);
      renderPass.draw(BACKGROUND_VERTEX_COUNT + BIRD_COUNT * BIRD_VERTEX_COUNT);
      renderPass.end();

      device.queue.submit([commandEncoder.finish()]);

      stateIndex = writeIndex;
    };
  };
};
