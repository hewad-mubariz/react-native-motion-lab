import { SUPERELLIPSE, SEAT, TIERS, LAYOUT, PITCH } from '@/theme/stadium';
import {
  buildSeatLayout,
  buildOffsetArcTable,
  lenAtTheta,
  thetaAtLen,
  ROW_SAMPLES,
  type SeatLayoutParams,
} from '@/geometry/seatLayout';
import { ringPoint } from '@/geometry/ringPoint';

const DEFAULT_PARAMS: SeatLayoutParams = {
  superellipse: { ...SUPERELLIPSE },
  seatPitch:    SEAT.pitch,
  rowDepth:     SEAT.rowDepth,
  rowRise:      SEAT.rowRise,
  tiers:        TIERS,
  sections:     LAYOUT.sections,
  aisleGap:     LAYOUT.aisleGap,
};

/** Returns the index of the first section whose midpoint is a "corner"
 *  (neither |x|/a > 0.88 nor |z|/b > 0.88). */
function firstCornerSection(p: SeatLayoutParams): number {
  const { a, b } = p.superellipse;
  for (let k = 0; k < p.sections; k++) {
    const thMid = ((k + 0.5) / p.sections) * Math.PI * 2;
    const q = ringPoint(thMid, p.superellipse);
    if (Math.abs(q.x) / a <= 0.88 && Math.abs(q.z) / b <= 0.88) return k;
  }
  return 3; // guaranteed corner for 28 sections with a=40, b=27
}

// ---------------------------------------------------------------------------

describe('ringPoint — curve and normal correctness', () => {
  const sp = { ...SUPERELLIPSE };

  it('every sampled point lies on the superellipse', () => {
    for (let i = 0; i < 32; i++) {
      const theta = (i / 32) * Math.PI * 2;
      const { x, z } = ringPoint(theta, sp);
      const val = Math.pow(Math.abs(x / sp.a), sp.n)
                + Math.pow(Math.abs(z / sp.b), sp.n);
      // |cos(θ)|² + |sin(θ)|² = 1 exactly by construction
      expect(val).toBeCloseTo(1, 8);
    }
  });

  it('outward normals are unit length', () => {
    for (let i = 0; i < 32; i++) {
      const theta = (i / 32) * Math.PI * 2;
      const { nx, nz } = ringPoint(theta, sp);
      expect(Math.hypot(nx, nz)).toBeCloseTo(1, 10);
    }
  });

  it('normals point outward at cardinal angles', () => {
    const right = ringPoint(0, sp);
    expect(right.nx).toBeCloseTo(1, 8);
    expect(right.nz).toBeCloseTo(0, 8);

    const top = ringPoint(Math.PI / 2, sp);
    expect(top.nx).toBeCloseTo(0, 8);
    expect(top.nz).toBeCloseTo(1, 8);
  });
});

// ---------------------------------------------------------------------------

describe('pitch corners — inner-wall inequality', () => {
  it('all four FIFA pitch corners satisfy |x/a|^n + |z/b|^n < 1', () => {
    const { a, b, n } = SUPERELLIPSE;
    const corners: [number, number][] = [
      [ PITCH.halfLength,  PITCH.halfWidth],
      [ PITCH.halfLength, -PITCH.halfWidth],
      [-PITCH.halfLength,  PITCH.halfWidth],
      [-PITCH.halfLength, -PITCH.halfWidth],
    ];
    for (const [px, pz] of corners) {
      const val = Math.pow(Math.abs(px / a), n)
                + Math.pow(Math.abs(pz / b), n);
      expect(val).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------

describe('arc-length table — thetaAtLen / lenAtTheta round-trip', () => {
  // Use the worst-case outer row (maximum curvature on the offset curve).
  const lastTier  = TIERS[TIERS.length - 1];
  const lastRow   = lastTier.rows - 1;
  const offset    = lastTier.baseOff + lastRow * SEAT.rowDepth;
  const cum       = buildOffsetArcTable(offset, SUPERELLIPSE);
  const total     = cum[ROW_SAMPLES];

  it('thetaAtLen → lenAtTheta recovers s to floating-point precision', () => {
    for (const frac of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const s     = frac * total;
      const th    = thetaAtLen(cum, s);
      const sBack = lenAtTheta(cum, th);
      // Both directions use the same linear table, so round-trip is near-exact.
      expect(sBack).toBeCloseTo(s, 6);
    }
  });
});

// ---------------------------------------------------------------------------

describe('total seat capacity', () => {
  it('is deterministic (pure function, no randomness)', () => {
    const count1 = buildSeatLayout(DEFAULT_PARAMS).length;
    const count2 = buildSeatLayout(DEFAULT_PARAMS).length;
    expect(count1).toBe(count2);
  });

  it('is in the expected range (~29 000 seats)', () => {
    const count = buildSeatLayout(DEFAULT_PARAMS).length;
    expect(count).toBeGreaterThan(25_000);
    expect(count).toBeLessThan(35_000);
  });
});

// ---------------------------------------------------------------------------

describe('gap invariant — worst-case outer corner row', () => {
  /**
   * Spec §3: "min gap == max gap == seatPitch (0.52) everywhere, including
   * the worst outer corner row."
   *
   * Seats are placed at arc-length positions  s0 + pad + j * seatPitch,
   * so consecutive gaps are exactly seatPitch by construction.  This test
   * catches bugs that would corrupt those positions (bad binary search,
   * wrong centering, sorting errors).
   */
  it('consecutive arc-length gaps equal seatPitch exactly', () => {
    const lastTierIdx  = DEFAULT_PARAMS.tiers.length - 1;
    const lastRowIdx   = DEFAULT_PARAMS.tiers[lastTierIdx].rows - 1;
    const cornerIdx    = firstCornerSection(DEFAULT_PARAMS);

    const layout = buildSeatLayout(DEFAULT_PARAMS);
    const rowSeats = layout
      .filter(s => s.tier === lastTierIdx && s.row === lastRowIdx && s.section === cornerIdx)
      .sort((a, b) => a.col - b.col);

    expect(rowSeats.length).toBeGreaterThan(1);

    const gaps = rowSeats.slice(1).map((seat, i) => seat.s - rowSeats[i].s);
    const minGap = Math.min(...gaps);
    const maxGap = Math.max(...gaps);

    expect(minGap).toBeCloseTo(DEFAULT_PARAMS.seatPitch, 8);
    expect(maxGap).toBeCloseTo(DEFAULT_PARAMS.seatPitch, 8);
  });
});
