export const BIRD_COUNT = 4000;
export const BIRD_VERTEX_COUNT = 9;
export const BACKGROUND_VERTEX_COUNT = 6;
export const FLOATS_PER_VEC4 = 4;
export const WORKGROUP_SIZE = 64;

// Mirror of the WebGPU GPUBufferUsage flags for environments where the
// global isn't available at import time (e.g. when bundling for native).
export const GPUBufferUsageFlags = {
  COPY_DST: 8,
  UNIFORM: 64,
  STORAGE: 128,
} as const;
