export interface RingPoint {
  x:  number;
  z:  number;
  nx: number;
  nz: number;
}

export interface SuperellipseParams {
  a: number;
  b: number;
  n: number;
}

/**
 * Position and outward unit normal on the superellipse |x/a|^n + |z/b|^n = 1.
 *
 * `theta` is the trigonometric parameter (NOT arc-length).
 * The normal is the normalised gradient of the implicit function — exact,
 * no finite-difference approximation needed.  Single source of truth for
 * the entire ring: bowl sweep, seat placement, and section proxies all call
 * this and stay registered when parameters change.
 */
export function ringPoint(theta: number, { a, b, n }: SuperellipseParams): RingPoint {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;

  const x = a * Math.sign(c) * Math.pow(Math.abs(c), e);
  const z = b * Math.sign(s) * Math.pow(Math.abs(s), e);

  // gradient of the implicit function ∇(|x/a|^n + |z/b|^n)
  let nx = Math.pow(Math.abs(x / a), n - 1) * Math.sign(x) / a;
  let nz = Math.pow(Math.abs(z / b), n - 1) * Math.sign(z) / b;
  const len = Math.hypot(nx, nz) || 1;

  return { x, z, nx: nx / len, nz: nz / len };
}
