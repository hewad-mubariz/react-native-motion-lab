import type { Scene } from "@/hooks/useWebGPU";
import { Asset } from "expo-asset";
import type { RefObject } from "react";
import { tigerChunksWGSL, tigerParticlesWGSL } from "./shaders";

const GPU_BUFFER_USAGE = {
  COPY_DST: 8,
  UNIFORM: 64,
  STORAGE: 128,
} as const;

const IMAGE_WIDTH = 1402;
const IMAGE_HEIGHT = 1122;
const IMAGE_FIT_RATIO = 0.95;
const PARTICLE_STRIDE_FLOATS = 8;
const CHUNK_STRIDE_FLOATS = 12;
const CHUNK_SIZE_PX = 140;

export interface TigerParticlesSceneOptions {
  imageModule: number | string;
  sampleStep: number;
}

export interface TigerParticlesControls {
  particleSizeRef: RefObject<number>;
  particleOpacityRef: RefObject<number>;
  brightnessRef: RefObject<number>;
  colorMixRef: RefObject<number>;
  explosionProgressRef: RefObject<number>;
  explosionForceRef: RefObject<number>;
  fallTargetRef: RefObject<number>;
  shatterTargetRef: RefObject<number>;
}

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const loadImageBitmap = async (
  imageModule: TigerParticlesSceneOptions["imageModule"],
) => {
  const asset = Asset.fromModule(imageModule);
  await asset.downloadAsync();
  const response = await fetch(asset.localUri ?? asset.uri);

  if (!response.ok) {
    throw new Error(`Could not load tiger image: ${response.status}`);
  }

  return createImageBitmap(await response.blob());
};

const createParticleData = (
  canvasWidth: number,
  canvasHeight: number,
  sampleStep: number,
) => {
  const fitScale = Math.min(
    (canvasWidth * IMAGE_FIT_RATIO) / IMAGE_WIDTH,
    (canvasHeight * IMAGE_FIT_RATIO) / IMAGE_HEIGHT,
  );
  const cols = Math.floor(IMAGE_WIDTH / sampleStep);
  const rows = Math.floor(IMAGE_HEIGHT / sampleStep);
  const particleCount = cols * rows;
  const data = new Float32Array(particleCount * PARTICLE_STRIDE_FLOATS);
  const particleSize = Math.max(1.25, sampleStep * fitScale);
  const burstScale = Math.min(canvasWidth, canvasHeight) / 860;
  const maxDist = Math.hypot(IMAGE_WIDTH * 0.5, IMAGE_HEIGHT * 0.5);

  let particleIndex = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const sampleX = x * sampleStep + sampleStep * 0.5;
      const sampleY = y * sampleStep + sampleStep * 0.5;

      // Chunk identity — all pixels in the same CHUNK_SIZE_PX region share
      // an explosion direction and force so they fly as a solid piece.
      const chunkX = Math.floor(sampleX / CHUNK_SIZE_PX);
      const chunkY = Math.floor(sampleY / CHUNK_SIZE_PX);
      const chunkSeed = chunkX * 1117 + chunkY * 7919;

      const chunkCenterX = (chunkX + 0.5) * CHUNK_SIZE_PX - IMAGE_WIDTH * 0.5;
      const chunkCenterY = (chunkY + 0.5) * CHUNK_SIZE_PX - IMAGE_HEIGHT * 0.5;

      const baseAngle = Math.atan2(chunkCenterY, chunkCenterX);
      const chunkAngle = baseAngle + (seededRandom(chunkSeed) - 0.5) * 0.9;
      const chunkDirX = Math.cos(chunkAngle);
      const chunkDirY = Math.sin(chunkAngle);

      // Scale force by distance from center so the middle barely moves (no hole)
      const distFromCenter = Math.hypot(chunkCenterX, chunkCenterY);
      const edgeScale = Math.min(distFromCenter / (maxDist * 0.3), 1.0) * 0.94 + 0.06;
      const chunkForce =
        (180 + seededRandom(chunkSeed + 1) * 460) * burstScale * edgeScale;

      const spinSpeed = (seededRandom(chunkSeed + 2) - 0.5) * 5.8;

      const out = particleIndex * PARTICLE_STRIDE_FLOATS;
      data[out] = (sampleX - IMAGE_WIDTH * 0.5) * fitScale;
      data[out + 1] = (sampleY - IMAGE_HEIGHT * 0.5) * fitScale;
      data[out + 2] = sampleX / IMAGE_WIDTH;
      data[out + 3] = sampleY / IMAGE_HEIGHT;
      data[out + 4] = chunkDirX;
      data[out + 5] = chunkDirY;
      data[out + 6] = chunkForce;
      data[out + 7] = spinSpeed;
      particleIndex += 1;
    }
  }

  return { data, particleCount, particleSize };
};

const createChunkData = (canvasWidth: number, canvasHeight: number) => {
  const fitScale = Math.min(
    (canvasWidth * IMAGE_FIT_RATIO) / IMAGE_WIDTH,
    (canvasHeight * IMAGE_FIT_RATIO) / IMAGE_HEIGHT,
  );
  const cols = Math.ceil(IMAGE_WIDTH / CHUNK_SIZE_PX);
  const rows = Math.ceil(IMAGE_HEIGHT / CHUNK_SIZE_PX);
  const chunkCount = cols * rows;
  const data = new Float32Array(chunkCount * CHUNK_STRIDE_FLOATS);
  const burstScale = Math.min(canvasWidth, canvasHeight) / 860;
  const maxDist = Math.hypot(IMAGE_WIDTH * 0.5, IMAGE_HEIGHT * 0.5);

  let chunkIndex = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const left = x * CHUNK_SIZE_PX;
      const top = y * CHUNK_SIZE_PX;
      const width = Math.min(CHUNK_SIZE_PX, IMAGE_WIDTH - left);
      const height = Math.min(CHUNK_SIZE_PX, IMAGE_HEIGHT - top);
      const centerX = left + width * 0.5;
      const centerY = top + height * 0.5;
      const originX = (centerX - IMAGE_WIDTH * 0.5) * fitScale;
      const originY = (centerY - IMAGE_HEIGHT * 0.5) * fitScale;
      const seed = x * 1117 + y * 7919;
      const baseAngle = Math.atan2(originY, originX);
      const angle = baseAngle + (seededRandom(seed) - 0.5) * 0.9;
      const distFromCenter = Math.hypot(originX / fitScale, originY / fitScale);
      const edgeScale = Math.min(distFromCenter / (maxDist * 0.3), 1.0) * 0.94 + 0.06;
      const out = chunkIndex * CHUNK_STRIDE_FLOATS;

      data[out] = originX;
      data[out + 1] = originY;
      data[out + 2] = width * fitScale;
      data[out + 3] = height * fitScale;
      data[out + 4] = centerX / IMAGE_WIDTH;
      data[out + 5] = centerY / IMAGE_HEIGHT;
      data[out + 6] = width / IMAGE_WIDTH;
      data[out + 7] = height / IMAGE_HEIGHT;
      data[out + 8] = Math.cos(angle);
      data[out + 9] = Math.sin(angle);
      data[out + 10] = (90 + seededRandom(seed + 1) * 210) * burstScale * edgeScale * 0.42;
      data[out + 11] = (seededRandom(seed + 2) - 0.5) * 0.72;
      chunkIndex += 1;
    }
  }

  return { data, chunkCount };
};

export const makeTigerParticlesScene = (
  controls: TigerParticlesControls,
  options: TigerParticlesSceneOptions,
): Scene => {
  return async ({ context, device, presentationFormat, canvas }) => {
    const imageBitmap = await loadImageBitmap(options.imageModule);
    const texture = device.createTexture({
      size: [imageBitmap.width, imageBitmap.height, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture },
      [imageBitmap.width, imageBitmap.height, 1],
    );

    const particles = createParticleData(
      canvas.width,
      canvas.height,
      options.sampleStep,
    );
    const chunks = createChunkData(canvas.width, canvas.height);
    const particleBuffer = device.createBuffer({
      size: particles.data.byteLength,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    const chunkBuffer = device.createBuffer({
      size: chunks.data.byteLength,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    device.queue.writeBuffer(particleBuffer, 0, particles.data as BufferSource);
    device.queue.writeBuffer(chunkBuffer, 0, chunks.data as BufferSource);

    const sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });
    const uniformBuffer = device.createBuffer({
      size: 16 * Float32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });
    const shader = device.createShaderModule({ code: tigerParticlesWGSL });
    const chunkShader = device.createShaderModule({ code: tigerChunksWGSL });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "particlesVertex" },
      fragment: {
        module: shader,
        entryPoint: "particlesFragment",
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    const chunkPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: chunkShader, entryPoint: "chunksVertex" },
      fragment: {
        module: chunkShader,
        entryPoint: "chunksFragment",
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: particleBuffer } },
        { binding: 2, resource: sampler },
        { binding: 3, resource: texture.createView() },
      ],
    });
    const chunkBindGroup = device.createBindGroup({
      layout: chunkPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: chunkBuffer } },
        { binding: 2, resource: sampler },
        { binding: 3, resource: texture.createView() },
      ],
    });
    const uniforms = new Float32Array(16);
    let fallProgress = 0;
    let shatterProgress = 0;
    let lastTime = 0;

    return (time: number) => {
      if (lastTime === 0) lastTime = time;
      const dt = Math.min(Math.max((time - lastTime) / 1000, 0), 0.05);
      lastTime = time;

      const fallTarget = controls.fallTargetRef.current;
      const fallSpeed = fallTarget > fallProgress ? 0.16 : 0.24;
      if (fallTarget > fallProgress) {
        fallProgress = Math.min(fallTarget, fallProgress + dt * fallSpeed);
      } else if (fallTarget < fallProgress) {
        fallProgress = Math.max(fallTarget, fallProgress - dt * fallSpeed);
      }

      // Shatter: fast to break (2.2×), slow to reassemble (0.88×)
      const shatterTarget = controls.shatterTargetRef.current ?? 0;
      if (shatterTarget > shatterProgress) {
        shatterProgress = Math.min(shatterTarget, shatterProgress + dt * 2.2);
      } else if (shatterTarget < shatterProgress) {
        shatterProgress = Math.max(shatterTarget, shatterProgress - dt * 0.88);
      }

      uniforms[0] = canvas.width;
      uniforms[1] = canvas.height;
      uniforms[2] = 1.0;
      uniforms[3] = 0;
      uniforms[4] = imageBitmap.width;
      uniforms[5] = imageBitmap.height;
      uniforms[6] = controls.explosionForceRef.current;
      // Manual slider can also drive progress; shatter auto-animation takes over on double-tap
      uniforms[7] = Math.max(controls.explosionProgressRef.current, shatterProgress);
      uniforms[8] = particles.particleSize * controls.particleSizeRef.current;
      uniforms[9] = controls.particleOpacityRef.current;
      uniforms[10] = controls.brightnessRef.current;
      uniforms[11] = controls.colorMixRef.current;
      uniforms[12] = fallProgress;
      uniforms[13] = 0;
      uniforms[14] = options.sampleStep;
      // Auto-enable chunk mode while shatter is animating (explosion and reassembly).
      // Drops to 0 automatically when pieces land — no React timing needed.
      uniforms[15] = shatterProgress > 0.01 ? 1.0 : 0.0;
      device.queue.writeBuffer(uniformBuffer, 0, uniforms as BufferSource);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: { r: 0.008, g: 0.009, b: 0.014, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      if (shatterProgress > 0.01) {
        pass.setPipeline(chunkPipeline);
        pass.setBindGroup(0, chunkBindGroup);
        pass.draw(6, chunks.chunkCount);
      } else {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6, particles.particleCount);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    };
  };
};
