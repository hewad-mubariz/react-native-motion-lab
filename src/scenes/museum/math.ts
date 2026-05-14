/**
 * Minimal column-major mat4 helpers.
 *
 * Layout: a Mat4 is a 16-element Float32Array stored column-major to match
 * WGSL's `mat4x4f` memory layout. Index `i*4 + j` is column `i`, row `j`,
 * i.e. element M[j][i] in standard math notation.
 *
 * All `out`-style functions write into and return the provided destination
 * so callers can reuse buffers and avoid allocations in the render loop.
 *
 * Projection follows WebGPU conventions: clip Y is up, clip Z is in [0, 1].
 */

export type Vec3 = readonly [number, number, number];
export type Mat4 = Float32Array;

export const mat4Create = (): Mat4 => new Float32Array(16);

export const mat4Perspective = (
  out: Mat4,
  fovY: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 => {
  const f = 1 / Math.tan(fovY * 0.5);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = far / (near - far);
  out[11] = -1;
  out[14] = (near * far) / (near - far);
  return out;
};

export const mat4LookAt = (
  out: Mat4,
  eye: Vec3,
  center: Vec3,
  up: Vec3,
): Mat4 => {
  const [ex, ey, ez] = eye;
  const [cx, cy, cz] = center;
  const [ux, uy, uz] = up;

  let fx = cx - ex;
  let fy = cy - ey;
  let fz = cz - ez;
  let len = Math.hypot(fx, fy, fz) || 1;
  fx /= len;
  fy /= len;
  fz /= len;

  let sx = fy * uz - fz * uy;
  let sy = fz * ux - fx * uz;
  let sz = fx * uy - fy * ux;
  len = Math.hypot(sx, sy, sz) || 1;
  sx /= len;
  sy /= len;
  sz /= len;

  const u0 = sy * fz - sz * fy;
  const u1 = sz * fx - sx * fz;
  const u2 = sx * fy - sy * fx;

  out[0] = sx;
  out[1] = u0;
  out[2] = -fx;
  out[3] = 0;
  out[4] = sy;
  out[5] = u1;
  out[6] = -fy;
  out[7] = 0;
  out[8] = sz;
  out[9] = u2;
  out[10] = -fz;
  out[11] = 0;
  out[12] = -(sx * ex + sy * ey + sz * ez);
  out[13] = -(u0 * ex + u1 * ey + u2 * ez);
  out[14] = fx * ex + fy * ey + fz * ez;
  out[15] = 1;
  return out;
};

export const mat4Multiply = (out: Mat4, a: Mat4, b: Mat4): Mat4 => {
  const a00 = a[0]; const a01 = a[1]; const a02 = a[2]; const a03 = a[3];
  const a10 = a[4]; const a11 = a[5]; const a12 = a[6]; const a13 = a[7];
  const a20 = a[8]; const a21 = a[9]; const a22 = a[10]; const a23 = a[11];
  const a30 = a[12]; const a31 = a[13]; const a32 = a[14]; const a33 = a[15];

  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4 + 0];
    const b1 = b[i * 4 + 1];
    const b2 = b[i * 4 + 2];
    const b3 = b[i * 4 + 3];
    out[i * 4 + 0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
};
