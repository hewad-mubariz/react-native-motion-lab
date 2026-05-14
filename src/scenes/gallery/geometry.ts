/**
 * JS-side mirrors of the geometric math the shader performs.
 */

import { GALLERY_CONFIG } from "./config";

export type Vec3 = readonly [number, number, number];

const fract = (x: number) => x - Math.floor(x);

/** Mirror WGSL `hash11`. */
const hash11 = (x: number) => fract(Math.sin(x * 91.3458) * 47453.5453);

function galleryOuterHalfZ(
  stripeIdx: number,
  j: number,
  frameThick: number,
  baseHalfW: number,
): number {
  const hw =
    baseHalfW *
    (0.44 + fract(hash11(stripeIdx * 1.3 + j * 4.1 + 0.02)) * (1.05 - 0.44));
  return hw + frameThick;
}

/** Mirror WGSL `galleryClusterDz`. */
function galleryClusterDz(
  pieceCntEff: number,
  pieceIdx: number,
  stripeIdx: number,
  stripeZ: number,
  frameThick: number,
  pcs: number,
  baseHalfW: number,
): number {
  const cap = Math.min(pieceCntEff, pcs, 8);
  const ow: number[] = [];
  const pz: number[] = [];
  for (let j = 0; j < cap; j++) {
    ow.push(galleryOuterHalfZ(stripeIdx, j, frameThick, baseHalfW));
  }
  if (cap === 0) return 0;
  pz[0] = 0;
  const gap = Math.max(stripeZ * 0.085, 0.22);
  for (let j = 1; j < cap; j++) {
    pz[j] = pz[j - 1] + ow[j - 1] + gap + ow[j];
  }
  const last = cap - 1;
  const left = pz[0] - ow[0];
  const right = pz[last] + ow[last];
  const midGeo = 0.5 * (left + right);
  if (pieceIdx >= cap) return 0;
  return pz[pieceIdx] - midGeo;
}

export interface GalleryPainting {
  readonly center: Vec3;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly visible: boolean;
}

/**
 * Mirror of WGSL `stripeRecycleZ` + `galleryPiece` for tap rays.
 */
export const galleryPainting = (
  slotIdx: number,
  walkDist: number,
): GalleryPainting => {
  const {
    stripeSpacing,
    piecesPerStripe,
    stripeCount,
    halfWidth: baseHalfW,
    halfHeight: baseHalfH,
    frameThickness,
  } = GALLERY_CONFIG.painting;
  const pcs = Math.max(1, Math.round(piecesPerStripe));
  const stripeIdx = Math.floor(slotIdx / pcs);
  const pieceIdx = slotIdx % pcs;
  const pieceCntEff = 1 + (stripeIdx % pcs);

  const stripeZ = stripeSpacing;
  const numStripes = Math.max(1, Math.round(stripeCount));
  const total = stripeZ * numStripes;
  const camZ = -walkDist;
  const base = stripeIdx * stripeZ;
  let offset = (((base - walkDist) % total) + total) % total;
  if (offset >= total / 2) offset -= total;
  const anchorZ = camZ - offset;

  const leftWall = stripeIdx % 2 === 0;
  const side = leftWall ? -1 : 1;
  const dz = galleryClusterDz(
    pieceCntEff,
    pieceIdx,
    stripeIdx,
    stripeZ,
    frameThickness,
    pcs,
    baseHalfW,
  );
  const { height: corridorH } = GALLERY_CONFIG.corridor;
  const h2 = corridorH * 0.5;
  const cyRaw =
    stripeZ * (-0.04 + fract(hash11(stripeIdx * 2.9)) * (0.095 - -0.04));
  const halfW =
    baseHalfW *
    (0.44 +
      fract(hash11(stripeIdx * 1.3 + pieceIdx * 4.1 + 0.02)) * (1.05 - 0.44));
  const rawHalfH =
    baseHalfH *
    (0.5 +
      fract(hash11(stripeIdx * 2.1 + pieceIdx * 3.7 + 0.09)) * (1.15 - 0.5));
  const halfH = Math.min(rawHalfH, GALLERY_CONFIG.painting.maxHalfHeight);

  const floorClear = Math.max(
    GALLERY_CONFIG.painting.floorClearance,
    corridorH * 0.19,
  );
  const ceilPad = Math.max(
    GALLERY_CONFIG.painting.ceilingClearance,
    corridorH * 0.06,
  );
  const minCy = -h2 + floorClear + halfH + frameThickness;
  const maxCy = h2 - ceilPad - halfH - frameThickness;
  const cy = Math.max(minCy, Math.min(maxCy, cyRaw));

  const { halfWidth: corridorHw } = GALLERY_CONFIG.corridor;
  const wallX = side * corridorHw;
  const inset = 0.01 + slotIdx * 0.000045;
  const x = wallX - side * inset;
  const cz = anchorZ + dz;

  const inCluster = pieceIdx < pieceCntEff;

  return {
    center: [x, cy, cz],
    halfWidth: halfW,
    halfHeight: halfH,
    visible: inCluster,
  };
};

export interface CameraBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

export const cameraBasis = (yaw: number, pitch: number): CameraBasis => {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const forward: Vec3 = [sy * cp, sp, -cy * cp];
  const right: Vec3 = [cy, 0, sy];
  const up: Vec3 = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return { forward, right, up };
};

const wrapAngleGeom = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

export interface PaintingFocusPose {
  walkDist: number;
  yaw: number;
  pitch: number;
}

/**
 * One-shot camera target for tap-to-inspect: walk + look-at consistent with
 * stripe recycling and lateral lean (no per-frame retargeting).
 */
export const computePaintingFocusPose = (
  slot: number,
  cur: PaintingFocusPose,
  cam: (typeof GALLERY_CONFIG)["camera"],
): PaintingFocusPose => {
  let w = cur.walkDist;
  for (let i = 0; i < 14; i++) {
    const gp = galleryPainting(slot, w);
    const wNext = -gp.center[2];
    if (Math.abs(wNext - w) < 0.008) {
      w = wNext;
      break;
    }
    w = wNext;
  }

  const gp = galleryPainting(slot, w);
  const [cx, cy, cz] = gp.center;

  let yaw = cur.yaw;
  let pitch = cur.pitch;
  for (let i = 0; i < 10; i++) {
    const eyeX = -Math.sin(yaw) * cam.lateralLean;
    const eyeZ = -w;
    const dx = cx - eyeX;
    const dy = cy - cam.eyeY;
    const dz = cz - eyeZ;
    const planarDist = Math.max(Math.hypot(dx, dz), 0.001);
    const nextYaw = Math.atan2(dx, -dz);
    pitch = Math.max(
      -cam.pitchLimit,
      Math.min(cam.pitchLimit, Math.atan2(dy, planarDist)),
    );
    if (Math.abs(wrapAngleGeom(nextYaw - yaw)) < 1e-5) {
      yaw = nextYaw;
      break;
    }
    yaw = nextYaw;
  }

  return { walkDist: w, yaw: wrapAngleGeom(yaw), pitch };
};
