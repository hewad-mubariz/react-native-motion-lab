import { ringPoint, type SuperellipseParams } from './ringPoint';

export const ROW_SAMPLES = 1024;

export interface SeatLayoutParams {
  superellipse: SuperellipseParams;
  seatPitch:  number;
  rowDepth:   number;
  rowRise:    number;
  tiers: ReadonlyArray<{ rows: number; baseH: number; baseOff: number }>;
  sections:  number;
  aisleGap:  number;
}

export interface SeatRecord {
  x:       number;
  y:       number;
  z:       number;
  /** yaw in radians — feeds directly into the instanced rotation matrix */
  yaw:     number;
  tier:    number;
  row:     number;
  section: number;
  col:     number;
  /**
   * Arc-length position of this seat on its offset curve.
   * Consecutive seats in the same section differ by exactly seatPitch
   * (placed by construction — see unit test in __tests__/seatLayout.test.ts).
   */
  s: number;
}

/**
 * Cumulative arc-length table for the offset curve at radial distance
 * `offset` from the superellipse.  Entry i is the arc length from theta=0
 * to theta = (i / samples) * 2π.
 *
 * Offset curves are LONGER than the base curve (by 2π × offset), so every
 * row must build its own table — approximating with a single global table
 * causes overlapping seats on straights and gaps at corners.
 */
export function buildOffsetArcTable(
  offset: number,
  sp: SuperellipseParams,
  samples = ROW_SAMPLES,
): Float32Array {
  const cum = new Float32Array(samples + 1);
  let len = 0;
  let prevX = 0, prevZ = 0;
  for (let i = 0; i <= samples; i++) {
    const th = (i / samples) * Math.PI * 2;
    const q  = ringPoint(th, sp);
    const x  = q.x + q.nx * offset;
    const z  = q.z + q.nz * offset;
    if (i > 0) len += Math.hypot(x - prevX, z - prevZ);
    cum[i] = len;
    prevX = x;
    prevZ = z;
  }
  return cum;
}

/** Arc length at theta by linear interpolation in the table. */
export function lenAtTheta(cum: Float32Array, theta: number): number {
  const samples = cum.length - 1;
  const f = (theta / (Math.PI * 2)) * samples;
  const i = Math.min(Math.floor(f), samples - 1);
  return cum[i] + (cum[i + 1] - cum[i]) * (f - i);
}

/** Theta in [0, 2π] at arc length s, via binary search + linear interpolation. */
export function thetaAtLen(cum: Float32Array, s: number): number {
  const samples = cum.length - 1;
  const total = cum[samples];
  s = ((s % total) + total) % total;
  let lo = 0, hi = samples;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < s) lo = mid + 1; else hi = mid;
  }
  const c0 = cum[lo - 1] || 0;
  const c1 = cum[lo];
  const f  = (s - c0) / (c1 - c0 || 1);
  return ((lo - 1 + f) / samples) * Math.PI * 2;
}

/**
 * Build every seat position for the stadium layout.
 *
 * Each section's arc span is filled with evenly-spaced, centred seats.
 * Every row shares the same section boundaries so aisles are radially
 * aligned across all rows and seat numbers are orderly (B12 · R14 · S23).
 */
export function buildSeatLayout(p: SeatLayoutParams): SeatRecord[] {
  const seats: SeatRecord[] = [];

  for (let ti = 0; ti < p.tiers.length; ti++) {
    const tier = p.tiers[ti];
    for (let r = 0; r < tier.rows; r++) {
      const offset = tier.baseOff + r * p.rowDepth;
      const y      = tier.baseH   + r * p.rowRise;
      const cum    = buildOffsetArcTable(offset, p.superellipse);
      const total  = cum[ROW_SAMPLES];

      for (let k = 0; k < p.sections; k++) {
        const th0 = (k       / p.sections) * Math.PI * 2;
        const th1 = ((k + 1) / p.sections) * Math.PI * 2;
        const s0  = lenAtTheta(cum, th0) + p.aisleGap * 0.5;
        const s1  = (k === p.sections - 1 ? total : lenAtTheta(cum, th1)) - p.aisleGap * 0.5;
        const span = s1 - s0;
        const n    = Math.floor(span / p.seatPitch);
        if (n <= 0) continue;
        // centre the block: equal padding on both aisle edges
        const pad = (span - n * p.seatPitch) / 2 + p.seatPitch * 0.5;

        for (let j = 0; j < n; j++) {
          const s  = s0 + pad + j * p.seatPitch;
          const th = thetaAtLen(cum, s);
          const q  = ringPoint(th, p.superellipse);
          const x  = q.x + q.nx * offset;
          const z  = q.z + q.nz * offset;
          // yaw so the seat faces inward (toward pitch centre)
          const yaw = Math.atan2(-q.nx, -q.nz);
          seats.push({ x, y, z, yaw, tier: ti, row: r, section: k, col: j, s });
        }
      }
    }
  }

  return seats;
}
