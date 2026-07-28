// World units = metres × 0.6
// Every constant a scene file needs must come from here — no hardcoded hex values.

export const SUPERELLIPSE = {
  a: 40,
  b: 27,
  n: 4,
} as const;

export const SEAT = {
  /** arc-length spacing between seat centres */
  pitch:    0.52,
  /** radial depth between consecutive rows */
  rowDepth: 0.82,
  /** vertical rise per row */
  rowRise:  0.46,
} as const;

/** Lower tier first, then upper tier. */
export const TIERS = [
  { rows: 26, baseH: 1.2,  baseOff: 0  },
  { rows: 22, baseH: 16.0, baseOff: 23 },
] as const;

export const LAYOUT = {
  sections:      28,
  aisleGap:      1.4,
  occupiedRatio: 0.35,
} as const;

/** Price-zone palette.  All values are pre-ACES-tonemap sRGB hex. */
export const ZONE = {
  blue:      0x1a55ff,   // vivid royal blue
  green:     0x10d050,   // vivid emerald green
  purple:    0x9933ff,   // vivid violet
  orange:    0xff8c00,   // vivid amber orange
  red:       0xff1a3a,   // vivid crimson
  gold:      0xe5b45b,   // selected seat
  /** taken seats: dark navy — visible as a seat color, never charcoal black */
  taken:     0x1e3a6e,
  dimFactor: 0.34,
} as const;

/** Normalized position thresholds for section classification. */
export const SECTION = {
  endThreshold:  0.88,   // |x|/a > this → "end" (behind goal)
  sideThreshold: 0.88,   // |z|/b > this → "side" (touchline), else "corner"
} as const;

/**
 * Pitch dimensions in world units (metres × 0.6).
 * Coordinate origin is the pitch centre.  x = length axis, z = width axis.
 */
export const PITCH = {
  halfLength:    31.5,   // 52.5 m × 0.6
  halfWidth:     20.4,   // 34 m × 0.6
  margin:         1.2,   // grass extends this far outside the boundary line
  penAreaDepth:   9.9,   // 16.5 m × 0.6
  penAreaHalfW:  12.1,   // 20.16 m × 0.6 (half-width from pitch centre)
  goalAreaDepth:  3.3,   // 5.5 m × 0.6
  goalAreaHalfW:  5.5,   // 9.16 m × 0.6
  circleRadius:   5.49,  // 9.15 m × 0.6
  penaltySpot:    6.6,   // 11 m × 0.6
  cornerRadius:   0.6,   // 1 m × 0.6
  /** pitch texture canvas size in world units */
  planeW: 66,
  planeH: 44,
  /** canvas pixels per world unit — anisotropy mandatory (see spec §5) */
  pxPerUnit:     16,
  apronColor:  '#1a1d23',
  grassBase:   '#2c8434',
  grassDark:   '#26772d',
  stripeWide:   5.4,
  stripeNarrow: 2.6,
} as const;

export const SPRING = {
  K:          170,
  DAMP:        10,
  liftTarget:  0.35,
  /** anticipation kick: negative initial velocity before the pop */
  liftKick:   -1.2,
  settlePos:   0.002,
  settleVel:   0.01,
} as const;

export const SCENE = {
  background:      0x0e0f12,
  fogDensity:      0.0038,
  hemiSky:         0xf4f4f8,   // near-white — no blue-gray tint on upward faces
  hemiGround:      0x1a1a22,   // dark neutral ground
  hemiIntensity:   0.9,
  keyColor:        0xfffcf0,
  keyIntensity:    1.6,         // strong key so face-to-face contrast is clear
  tonemapExposure: 1.05,
  concrete:        0x7d7568,
} as const;

export const CAMERA = {
  /** horizontal fov is fixed; vertical is derived from aspect (spec §7) */
  hFovRad:   60 * (Math.PI / 180),
  minFovDeg: 45,
  maxFovDeg: 100,
  near:       0.5,
  far:      800,
  orbit: {
    theta:  0.6,
    phi:    1.05,
    radius: 150,
    minR:   18,
    maxR:   240,
    minPhi: 0.12,
    maxPhi: 1.35,
  },
  farTarget:     [0, 6, 0] as const,
  sectionRadius: 30,
  sectionPhi:    1.12,
  zoomDuration:  1.2,
} as const;
