import type { Scene } from "@/hooks/useWebGPU";
import { Asset } from "expo-asset";
import type { RefObject } from "react";
import { pixelExplosionWGSL } from "./shaders";

const GPU_BUFFER_USAGE = {
  COPY_DST: 8,
  UNIFORM: 64,
  STORAGE: 128,
} as const;

const PARTICLE_STRIDE_FLOATS = 8;
const UNIFORM_FLOATS = 16;
const IMAGE_SAMPLE_STEP = 8;
const MAX_PARTICLES = 28000;
const TEXTURE_ROW_ALIGNMENT = 256;

export interface PixelExplosionControls {
  triggerRef: RefObject<number>;
  particleSizeRef: RefObject<number>;
  explosionForceRef: RefObject<number>;
  delayModeRef: RefObject<"center" | "edges">;
}

export interface PixelExplosionOptions {
  imageModule: number | string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const makeFallbackPixels = (
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
) => {
  const pixels = new Uint8Array(width * height * 4);
  const cx = imageWidth * 0.5;
  const cy = imageHeight * 0.48;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const outside = x >= imageWidth || y >= imageHeight;
      const dx = (x - cx) / imageWidth;
      const dy = (y - cy) / imageHeight;
      const r = Math.hypot(x - cx, y - cy) / maxR;
      const stripe =
        Math.sin((Math.atan2(dy, dx) * 8 + r * 34) * Math.PI) > 0.15 ? 1 : 0;
      const face = Math.max(0, 1 - r * 1.75);
      const muzzle = Math.exp(
        -((dx * dx) / 0.018 + ((dy - 0.16) * (dy - 0.16)) / 0.028),
      );
      const eyeL = Math.exp(
        -(
          ((dx + 0.12) * (dx + 0.12)) / 0.002 +
          ((dy + 0.02) * (dy + 0.02)) / 0.002
        ),
      );
      const eyeR = Math.exp(
        -(
          ((dx - 0.12) * (dx - 0.12)) / 0.002 +
          ((dy + 0.02) * (dy + 0.02)) / 0.002
        ),
      );
      const ink = stripe * face * 0.82;
      const orange = face * (0.58 + Math.sin(y * 0.04) * 0.08);
      const white = muzzle * 0.9 + (eyeL + eyeR) * 0.8;

      pixels[i] = outside
        ? 0
        : Math.round((orange * 220 + white * 230) * (1 - ink * 0.82));
      pixels[i + 1] = outside
        ? 0
        : Math.round((orange * 108 + white * 218) * (1 - ink * 0.9));
      pixels[i + 2] = outside
        ? 0
        : Math.round((orange * 24 + white * 185) * (1 - ink * 0.94));
      pixels[i + 3] = outside ? 0 : Math.round(Math.max(face, muzzle) * 255);
    }
  }

  return pixels;
};

const loadImageBitmap = async (
  imageModule: PixelExplosionOptions["imageModule"],
) => {
  const asset = Asset.fromModule(imageModule);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Could not load particle image: ${response.status}`);
  }
  return createImageBitmap(await response.blob());
};

const uploadTigerTexture = async (
  device: GPUDevice,
  texture: GPUTexture,
  imageModule: PixelExplosionOptions["imageModule"],
) => {
  try {
    const imageBitmap = await loadImageBitmap(imageModule);
    device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture },
      [imageBitmap.width, imageBitmap.height, 1],
    );
  } catch (error) {
    console.warn(
      "Tiger texture failed to load; keeping fallback texture.",
      error,
    );
  }
};

const createParticleData = (
  imageWidth: number,
  imageHeight: number,
  textureWidth: number,
  textureHeight: number,
  canvasWidth: number,
  canvasHeight: number,
) => {
  const fitScale = Math.min(
    (canvasWidth * 0.72) / imageWidth,
    (canvasHeight * 0.76) / imageHeight,
  );
  const step = Math.max(
    IMAGE_SAMPLE_STEP,
    Math.ceil(
      Math.sqrt(
        ((imageWidth / IMAGE_SAMPLE_STEP) * (imageHeight / IMAGE_SAMPLE_STEP)) /
          MAX_PARTICLES,
      ) * IMAGE_SAMPLE_STEP,
    ),
  );
  const cols = Math.floor(imageWidth / step);
  const rows = Math.floor(imageHeight / step);
  const particleCount = cols * rows;
  const data = new Float32Array(particleCount * PARTICLE_STRIDE_FLOATS);
  const maxRadius = Math.hypot(imageWidth, imageHeight) * 0.5;
  const burstScale = Math.min(canvasWidth, canvasHeight) / 860;

  let i = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * step + step * 0.5;
      const py = y * step + step * 0.5;
      const ox = (px - imageWidth * 0.5) * fitScale;
      const oy = (py - imageHeight * 0.5) * fitScale;
      const radial = clamp(
        Math.hypot(px - imageWidth * 0.5, py - imageHeight * 0.5) / maxRadius,
        0,
        1,
      );
      const seed = x * 197.31 + y * 31.17;
      const angle = Math.atan2(oy, ox) + (seededRandom(seed) - 0.5) * 1.55;
      const distance =
        (120 + seededRandom(seed + 4.4) * 310) *
        burstScale *
        (0.65 + radial * 0.75);
      const out = i * PARTICLE_STRIDE_FLOATS;

      data[out] = ox;
      data[out + 1] = oy;
      data[out + 2] = ox + Math.cos(angle) * distance;
      data[out + 3] = oy + Math.sin(angle) * distance;
      data[out + 4] = px / textureWidth;
      data[out + 5] = py / textureHeight;
      data[out + 6] = radial;
      data[out + 7] = seededRandom(seed + 9.8);
      i += 1;
    }
  }

  return {
    data,
    particleCount,
    particleSize: Math.max(2.2, step * fitScale * 0.88),
  };
};

const alignTextureWidth = (width: number) => {
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const alignedRowBytes =
    Math.ceil(rowBytes / TEXTURE_ROW_ALIGNMENT) * TEXTURE_ROW_ALIGNMENT;
  return alignedRowBytes / bytesPerPixel;
};

const sequenceProgress = (elapsed: number) => {
  const explode = 1.2;
  const hold = 0.34;
  const reform = 1.85;
  const rest = 0.72;
  const total = explode + hold + reform + rest;
  const t = ((elapsed % total) + total) % total;

  if (t < explode) return t / explode;
  if (t < explode + hold) return 1;
  if (t < explode + hold + reform) {
    return 1 - (t - explode - hold) / reform;
  }
  return 0;
};

export const makePixelExplosionScene = (
  controls: PixelExplosionControls,
  options: PixelExplosionOptions,
): Scene => {
  return ({ context, device, presentationFormat, canvas }) => {
    const imageWidth = 1402;
    const imageHeight = 1122;
    const textureWidth = alignTextureWidth(imageWidth);
    const textureHeight = imageHeight;
    const texture = device.createTexture({
      size: [textureWidth, textureHeight, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    device.queue.writeTexture(
      { texture },
      makeFallbackPixels(textureWidth, textureHeight, imageWidth, imageHeight),
      { bytesPerRow: textureWidth * 4, rowsPerImage: textureHeight },
      [textureWidth, textureHeight, 1],
    );

    void uploadTigerTexture(device, texture, options.imageModule);

    const sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });

    const particles = createParticleData(
      imageWidth,
      imageHeight,
      textureWidth,
      textureHeight,
      canvas.width,
      canvas.height,
    );
    const particleBuffer = device.createBuffer({
      size: particles.data.byteLength,
      usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST,
    });
    device.queue.writeBuffer(particleBuffer, 0, particles.data as BufferSource);

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT,
      usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
    });

    const shader = device.createShaderModule({ code: pixelExplosionWGSL });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: shader, entryPoint: "vertexMain" },
      fragment: {
        module: shader,
        entryPoint: "fragmentMain",
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

    const uniforms = new Float32Array(UNIFORM_FLOATS);
    const clearValue = { r: 0.008, g: 0.009, b: 0.014, a: 1 };
    let bootTime = Date.now();
    let seenTrigger = controls.triggerRef.current;

    return (time: number) => {
      if (controls.triggerRef.current !== seenTrigger) {
        seenTrigger = controls.triggerRef.current;
        bootTime = time;
      }

      const elapsed = (time - bootTime) / 1000;
      const progress = sequenceProgress(elapsed);
      const particleSize =
        particles.particleSize * controls.particleSizeRef.current;
      const force = controls.explosionForceRef.current;
      const delayMode = controls.delayModeRef.current === "edges" ? 1 : 0;

      uniforms[0] = canvas.width;
      uniforms[1] = canvas.height;
      uniforms[2] = imageWidth;
      uniforms[3] = imageHeight;
      uniforms[4] = progress;
      uniforms[5] = elapsed;
      uniforms[6] = force;
      uniforms[7] = particles.particleCount;
      uniforms[8] = particleSize;
      uniforms[9] = 0;
      uniforms[10] = delayMode;
      uniforms[11] = 0;
      uniforms[12] = 0.1;
      uniforms[13] = 0.7;
      uniforms[14] = 1;
      uniforms[15] = 1;
      device.queue.writeBuffer(uniformBuffer, 0, uniforms as BufferSource);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue,
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6, particles.particleCount);
      pass.end();

      device.queue.submit([encoder.finish()]);
    };
  };
};
