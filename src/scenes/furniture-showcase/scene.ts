import type { Scene } from "@/hooks/useWebGPU";
import {
  mat4Create,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
} from "@/scenes/gallery/math";
import type { RefObject } from "react";
import { loadGlbMesh } from "./glb";
import { furnitureWGSL } from "./shaders";

const UNIFORM = 0x40;
const COPY_DST = 0x8;
const VERTEX = 0x20;
const INDEX = 0x10;
const TEXTURE_BINDING = 0x4;
const COPY_DST_TEXTURE = 0x2;
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
const UNIFORM_BUFFER_SIZE = 112;
const FLOATS_PER_VERTEX = 11;

export interface OrbitState {
  yaw: number;
  pitch: number;
  distance: number;
}

export interface FurnitureSceneControls {
  orbitRef: RefObject<OrbitState>;
}

export interface FurnitureSceneOptions {
  modelUri: string;
}

type Vec3 = [number, number, number];

export const makeFurnitureScene = (
  controls: FurnitureSceneControls,
  options: FurnitureSceneOptions,
): Scene => {
  return async ({ context, device, presentationFormat, canvas }) => {
    const model = await loadGlbMesh(options.modelUri);
    const shader = device.createShaderModule({ code: furnitureWGSL });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32x2" },
              { shaderLocation: 3, offset: 32, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: {
        module: shader,
        entryPoint: "fragmentMain",
        targets: [{ format: presentationFormat }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthCompare: "less",
        depthWriteEnabled: true,
      },
    });

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: UNIFORM | COPY_DST,
    });

    const sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    const makeTexture = async (imageBytes?: Uint8Array<ArrayBuffer>) => {
      if (!imageBytes) {
        const texture = device.createTexture({
          size: [1, 1, 1],
          format: "rgba8unorm",
          usage: TEXTURE_BINDING | COPY_DST_TEXTURE,
        });
        device.queue.writeTexture(
          { texture },
          new Uint8Array([255, 255, 255, 255]),
          { bytesPerRow: 4, rowsPerImage: 1 },
          [1, 1, 1],
        );
        return texture;
      }

      const imageBitmap = await createImageBitmap(imageBytes);
      const texture = device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: "rgba8unorm",
        usage:
          TEXTURE_BINDING |
          COPY_DST_TEXTURE |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture },
        [imageBitmap.width, imageBitmap.height, 1],
      );
      return texture;
    };

    const materialBindGroups = await Promise.all(
      model.materials.map(async (material) => {
        const texture = await makeTexture(material.baseColorImage);
        return device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: texture.createView() },
          ],
        });
      }),
    );

    const primitiveDraws = model.primitives.map((primitive) => {
      const vertexBuffer = device.createBuffer({
        size: primitive.vertices.byteLength,
        usage: VERTEX | COPY_DST,
      });
      device.queue.writeBuffer(vertexBuffer, 0, primitive.vertices);

      const indexBuffer = device.createBuffer({
        size: primitive.indices.byteLength,
        usage: INDEX | COPY_DST,
      });
      device.queue.writeBuffer(indexBuffer, 0, primitive.indices);

      return {
        bindGroup:
          materialBindGroups[primitive.materialIndex] ?? materialBindGroups[0],
        indexBuffer,
        indexCount: primitive.indices.length,
        indexFormat: primitive.indexFormat,
        vertexBuffer,
      };
    });

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const aspect = canvas.width / Math.max(canvas.height, 1);
    const proj = mat4Create();
    const view = mat4Create();
    const viewProj = mat4Create();
    const uniformBytes = new ArrayBuffer(UNIFORM_BUFFER_SIZE);
    const f32 = new Float32Array(uniformBytes);
    const center: Vec3 = [
      (model.bounds.min[0] + model.bounds.max[0]) * 0.5,
      (model.bounds.min[1] + model.bounds.max[1]) * 0.5,
      (model.bounds.min[2] + model.bounds.max[2]) * 0.5,
    ];

    return (time: number) => {
      const orbit = controls.orbitRef.current ?? {
        yaw: -0.55,
        pitch: 0.28,
        distance: 3.15,
      };
      const cosPitch = Math.cos(orbit.pitch);
      const eye: Vec3 = [
        center[0] + Math.sin(orbit.yaw) * cosPitch * orbit.distance,
        center[1] + Math.sin(orbit.pitch) * orbit.distance,
        center[2] + Math.cos(orbit.yaw) * cosPitch * orbit.distance,
      ];

      mat4Perspective(proj, Math.PI / 4, aspect, 0.1, 20);
      mat4LookAt(view, eye, center, [0, 1, 0]);
      mat4Multiply(viewProj, proj, view);

      f32.set(viewProj, 0);
      f32[16] = eye[0];
      f32[17] = eye[1];
      f32[18] = eye[2];
      f32[19] = 1;
      f32[20] = -0.48;
      f32[21] = -0.82;
      f32[22] = -0.34;
      f32[23] = time / 1000;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.735, g: 0.735, b: 0.735, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      pass.setPipeline(pipeline);
      for (const draw of primitiveDraws) {
        pass.setBindGroup(0, draw.bindGroup);
        pass.setVertexBuffer(0, draw.vertexBuffer);
        pass.setIndexBuffer(draw.indexBuffer, draw.indexFormat);
        pass.drawIndexed(draw.indexCount);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    };
  };
};
