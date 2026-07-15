import { vec, type SkPoint } from "@shopify/react-native-skia";
import { CATS, CUBE_H, ORIGINS, S, TH, TW } from "./constants";
import type { Building, Cube, MetricKey, Tile } from "./types";

type MutablePoint = { x: number; y: number };

export const VW = 720;
export const VH = 540;
export const BASE_Y = VH - 100;
const ISO_OX = VW / 2 - 45;
const ISO_OY = 198;
export const TILE_DY = 2 * TH;

const BAR_W = 4 * S;
const GAP = 24;
export const CHART_W = CATS.length * BAR_W + (CATS.length - 1) * GAP;
export const CHART_X = (VW - CHART_W) / 2;
export const CITY_CX = 5.5;
export const CITY_CY = 2.5;
export const GX0 = -3;
export const GX1 = 14;
export const GY0 = -2;
export const GY1 = 8;
export function isoX(gx: number, gy: number): number {
  "worklet";
  return ISO_OX + (gx - gy) * TW;
}
export function isoY(gx: number, gy: number, lvl: number): number {
  "worklet";
  return ISO_OY + (gx + gy) * TH - lvl * CUBE_H;
}
function tileCenter(gx: number, gy: number) {
  "worklet";

  return { x: isoX(gx, gy), y: isoY(gx, gy, 0) + TILE_DY };
}

export function buildGroundVerticesStatic(tiles: Tile[]): SkPoint[] {
  const pts: SkPoint[] = new Array(tiles.length * VERTS_PER_TILE);
  let i = 0;
  for (const tl of tiles) {
    const { x, y } = tileCenter(tl.gx, tl.gy);
    pts[i++] = vec(x, y - TH); // N
    pts[i++] = vec(x + TW, y); // E
    pts[i++] = vec(x, y + TH); // S
    pts[i++] = vec(x - TW, y); // W
  }
  return pts;
}

export function buildGroundIndices(tileCount: number): number[] {
  const idx: number[] = [];
  for (let t = 0; t < tileCount; t++) {
    const b = t * VERTS_PER_TILE;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3); // N-E-S, N-S-W
  }
  return idx;
}

const TILE_COLORS = {
  day: { plain: "#F6F1E7", alt: "#EFE8DB", green: "#C7DDB5", road: "#D9D4CC" },
  night: {
    plain: "#433A50",
    alt: "#3B3247",
    green: "#4E5D45",
    road: "#3A3344",
  },
};

export function buildGroundColorsStatic(tiles: Tile[], mode: "day" | "night") {
  const palette = TILE_COLORS[mode];
  const colors: string[] = [];
  for (const tl of tiles) {
    const c = palette[tl.kind];
    colors.push(c, c, c, c); // one color per vertex, flat-shaded diamond
  }
  return colors;
}

export function buildIslandVertices(): SkPoint[] {
  const ext = 17;
  const e = { x: isoX(GX1, GY0), y: isoY(GX1, GY0, 0) + TILE_DY };
  const s = { x: isoX(GX1, GY1), y: isoY(GX1, GY1, 0) + TILE_DY };
  const w = { x: isoX(GX0, GY1), y: isoY(GX0, GY1, 0) + TILE_DY };
  const pE = { x: e.x + TW, y: e.y };
  const pS = { x: s.x, y: s.y + TH };
  const pW = { x: w.x - TW, y: w.y };

  return [
    pW,
    pS,
    { x: pS.x, y: pS.y + ext },
    { x: pW.x, y: pW.y + ext },
    pS,
    pE,
    { x: pE.x, y: pE.y + ext },
    { x: pS.x, y: pS.y + ext },
  ];
}

export function buildIslandColors(top: string, side: string): string[] {
  return [top, top, top, top, side, side, side, side];
}

/* ---- deterministic pseudo-random (same as prototype) ---- */
const rnd = (i: number) => {
  const s = Math.sin(i * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

type CityLayout = {
  cubes: Cube[];
  buildings: Building[];
  tiles: Tile[];
  heights: number[];
  tallestIndex: number;
};

export type ProjectedBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
};

function boundsFromPoints(points: readonly MutablePoint[]): ProjectedBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function addCubeProjectedPoints(
  points: MutablePoint[],
  gx: number,
  gy: number,
  lvl: number,
  includeExtrusion: boolean,
) {
  const x = isoX(gx, gy);
  const y = isoY(gx, gy, lvl);
  points.push(
    { x, y: y - TH },
    { x: x + TW, y },
    { x, y: y + TH },
    { x: x - TW, y },
  );
  if (includeExtrusion) {
    points.push(
      { x: x + TW, y: y + CUBE_H },
      { x, y: y + TH + CUBE_H },
      { x: x - TW, y: y + CUBE_H },
    );
  }
}

export function getBuildingRoofBounds(
  building: Building,
  height: number,
): ProjectedBounds {
  const points: MutablePoint[] = [];
  const topLevel = Math.max(0, Math.ceil(height) - 1);

  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      addCubeProjectedPoints(
        points,
        building.gx + dx,
        building.gy + dy,
        topLevel,
        false,
      );
    }
  }

  return boundsFromPoints(points);
}

export function getBuildingProjectedBounds(
  building: Building,
  height: number,
): ProjectedBounds {
  const points: MutablePoint[] = [];
  const levels = Math.max(1, Math.ceil(height));

  for (let lvl = 0; lvl < levels; lvl++) {
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        addCubeProjectedPoints(
          points,
          building.gx + dx,
          building.gy + dy,
          lvl,
          true,
        );
      }
    }
  }

  return boundsFromPoints(points);
}

function metricValue(cat: (typeof CATS)[number], metric: MetricKey) {
  if (metric === "volume") return cat.volumeMo;
  if (metric === "digital") return cat.digitalPercent;
  return cat.value;
}

export function heightsForMetric(metric: MetricKey): number[] {
  const values = CATS.map((c) => metricValue(c, metric));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);
  return values.map(
    (value) => 3 + Math.round(((value - minValue) / range) * 8),
  );
}

export function buildLayout(
  metric: MetricKey = "wait",
  fixedHeights?: readonly number[],
): CityLayout {
  const heights = fixedHeights ? [...fixedHeights] : heightsForMetric(metric);
  const tallestIndex = heights.indexOf(Math.max(...heights));

  const buildings: Building[] = CATS.map((c, i) => {
    const [gx, gy] = ORIGINS[i];
    const h = heights[i];
    const lift = 24 + (i % 2) * 24 + (gy === 0 ? 10 : 0);
    return {
      catIndex: i,
      gx,
      gy,
      h,
      barCenterX: CHART_X + i * (BAR_W + GAP) + BAR_W / 2,
      labelDelay: (gx + gy) * 0.026 + (h - 1) * 0.017 + 0.06,
      lift,
    };
  });
  buildings[tallestIndex].lift += 20;

  /* cubes: every bar is 4 wide × h tall → footprint 2×2 × h */
  const cubes: Cube[] = [];
  let cid = 0;
  for (const b of buildings) {
    for (let cn = 0; cn < 4; cn++) {
      for (let row = 0; row < b.h; row++) {
        const gx = b.gx + (cn % 2);
        const gy = b.gy + (cn >> 1);
        cid++;
        cubes.push({
          catIndex: b.catIndex,
          isRoof: row === b.h - 1,
          hTot: b.h,
          ax: CHART_X + b.catIndex * (BAR_W + GAP) + cn * S + S / 2,
          ay: BASE_Y - row * S - S / 2,
          gx,
          gy,
          lvl: row,
          bx: isoX(gx, gy),
          by: isoY(gx, gy, row),
          delay: (gx + gy) * 0.026 + row * 0.017 + rnd(cid * 3.7) * 0.06,
          jitter: 0.85 + rnd(cid * 9.1) * 0.3,
          tint: (rnd(cid * 5.3) - 0.5) * 0.07,
          windowSeeds: [0, 1, 2, 3].map((k) => rnd(cid * 13.3 + k * 71.7)) as [
            number,
            number,
            number,
            number,
          ],
        });
      }
    }
  }

  /* painter's sort — back-to-front, bottom-up. Do it ONCE here,
     so the render loop never sorts. */
  cubes.sort(
    (a, b) => (a.gx + a.gy) * 100 + a.lvl - ((b.gx + b.gy) * 100 + b.lvl),
  );

  /* ground tiles */
  const inFootprint = (gx: number, gy: number) =>
    buildings.some(
      (b) => gx >= b.gx && gx <= b.gx + 1 && gy >= b.gy && gy <= b.gy + 1,
    );
  const isRoad = (gy: number) => gy === 2 || gy === 3;

  const tiles: Tile[] = [];
  for (let gx = GX0; gx <= GX1; gx++) {
    for (let gy = GY0; gy <= GY1; gy++) {
      const dist = Math.hypot(gx - CITY_CX, (gy - CITY_CY) * 1.6);
      const kind = isRoad(gy)
        ? "road"
        : !inFootprint(gx, gy) && rnd(gx * 31.7 + gy * 57.3) > 0.8
          ? "green"
          : (gx + gy) & 1
            ? "alt"
            : "plain";
      tiles.push({
        gx,
        gy,
        kind,
        delay: dist * 0.045 + rnd(gx * 7 + gy * 13) * 0.04,
      });
    }
  }

  return { cubes, buildings, tiles, heights, tallestIndex };
}

/* ---------- easing (worklets: called per frame on UI thread) ---------- */
export function clamp01(v: number): number {
  "worklet";
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function easeOutBack(x: number): number {
  "worklet";
  const c = 1.70158;
  const m = x - 1;
  return 1 + (c + 1) * m * m * m + c * m * m;
}
export function smooth(x: number): number {
  "worklet";
  return x * x * (3 - 2 * x);
}

export function updateMetricHeights(
  output: number[],
  from: readonly number[],
  to: readonly number[],
  progress: number,
): void {
  "worklet";
  for (let i = 0; i < output.length; i++) {
    const p = clamp01((progress - i * 0.058) / 0.71);
    const eased =
      p >= 1 ? 1 : clamp01(smooth(p) + 0.12 * Math.sin(p * Math.PI));
    output[i] = from[i] + (to[i] - from[i]) * eased;
  }
}

/* =====================================================================
   Vertex layout per cube:
   12 face vertices + 16 window vertices.
   Written in painter's order (cubes array is pre-sorted), and within a
   cube sides-then-top-then-windows, so windows are occluded by later cubes
   just like the original canvas implementation.
   ===================================================================== */
const FACE_VERTS_PER_CUBE = 12;
const WINDOWS_PER_CUBE = 4;
const VERTS_PER_WINDOW = 4;
const VERTS_PER_CUBE =
  FACE_VERTS_PER_CUBE + WINDOWS_PER_CUBE * VERTS_PER_WINDOW;
const VERTS_PER_TRAIL = 4;
const VERTS_PER_TILE = 4;

/*
 * Profiling switches for the metric-change hot path.
 * Keep the vertex layout intact, but zero optional geometry so we can turn
 * features back on one by one without changing indices/colors/render shape.
 */
const ENABLE_CUBE_WINDOWS = true;
const ENABLE_MOTION_TRAILS = true;
const ENABLE_CUBE_MORPH_POSITION_MATH = true;
const ENABLE_CUBE_GEOMETRY_REWRITE = true;

export function allocCubePoints(cubeCount: number): MutablePoint[] {
  const pts: MutablePoint[] = new Array(cubeCount * VERTS_PER_CUBE);
  for (let i = 0; i < pts.length; i++) pts[i] = { x: 0, y: 0 };
  return pts;
}

export function buildCubeIndices(cubeCount: number): number[] {
  const idx: number[] = [];
  for (let c = 0; c < cubeCount; c++) {
    const b = c * VERTS_PER_CUBE;
    for (const q of [0, 4, 8]) {
      idx.push(b + q, b + q + 1, b + q + 2, b + q, b + q + 2, b + q + 3);
    }
    for (let w = 0; w < WINDOWS_PER_CUBE; w++) {
      const wb = b + FACE_VERTS_PER_CUBE + w * VERTS_PER_WINDOW;
      idx.push(wb, wb + 1, wb + 2, wb, wb + 2, wb + 3);
    }
  }
  return idx;
}
type RGB = [number, number, number];

function rgbCss([r, g, b]: RGB): string {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function mixRgb(a: RGB, b: RGB, f: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

function overlayRgb(base: RGB, color: RGB, alpha: number): string {
  return rgbCss(mixRgb(base, color, alpha));
}

function mixTowardRgb(hex: string, f: number, target: RGB, amt: number): RGB {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  const t = f > 0 ? 255 : 0,
    a = Math.abs(f);
  r += (t - r) * a;
  g += (t - g) * a;
  b += (t - b) * a;
  r += (target[0] - r) * amt;
  g += (target[1] - g) * amt;
  b += (target[2] - b) * amt;
  return [r, g, b];
}

const NIGHT_MIX: RGB = [43, 35, 51]; // #2B2333
const WINDOW_GLASS_DAY: RGB = [46, 52, 64];
const WINDOW_GLASS_NIGHT: RGB = [24, 20, 34];
const WINDOW_LIGHT: RGB = [255, 215, 130];
const WINDOW_LIGHT_DIM: RGB = [222, 178, 96];

export function buildCubeColorsStatic(
  cubes: Cube[],
  mode: "day" | "night",
  highlightedCatIndex = -1,
) {
  const colors: string[] = [];
  const glass = mode === "night" ? WINDOW_GLASS_NIGHT : WINDOW_GLASS_DAY;
  const hasHighlight = highlightedCatIndex >= 0;
  for (const cu of cubes) {
    const cat = CATS[cu.catIndex];
    const isHighlighted = cu.catIndex === highlightedCatIndex;
    const isSoftFocus = mode === "night" && hasHighlight && !isHighlighted;
    const base = mode === "night" ? cat.darkColor : cat.color;
    const ao = (cu.lvl / cu.hTot) * 0.1 - 0.05; // darker base, lighter top
    const roof = cu.isRoof ? 0.1 : 0;
    let leftRgb = mixTowardRgb(base, -0.08 + cu.tint + ao, NIGHT_MIX, 0);
    let rightRgb = mixTowardRgb(base, -0.3 + cu.tint + ao, NIGHT_MIX, 0);
    let topRgb = mixTowardRgb(base, 0.25 + cu.tint + ao + roof, NIGHT_MIX, 0);
    if (isSoftFocus) {
      leftRgb = mixRgb(leftRgb, NIGHT_MIX, 0.12);
      rightRgb = mixRgb(rightRgb, NIGHT_MIX, 0.14);
      topRgb = mixRgb(topRgb, NIGHT_MIX, 0.1);
    }
    const left = rgbCss(leftRgb);
    const right = rgbCss(rightRgb);
    const top = rgbCss(topRgb);
    for (let i = 0; i < 4; i++) colors.push(left);
    for (let i = 0; i < 4; i++) colors.push(right);
    for (let i = 0; i < 4; i++) colors.push(top);
    for (let face = 0; face < 2; face++) {
      for (let wi = 0; wi < 2; wi++) {
        const faceRgb = face === 0 ? rightRgb : leftRgb;
        const lit =
          mode === "night" &&
          (isHighlighted ||
            cu.windowSeeds[face * 2 + wi] > 0.45);
        const lightRgb = isSoftFocus ? WINDOW_LIGHT_DIM : WINDOW_LIGHT;
        const lightAlpha = isHighlighted ? 0.9 : hasHighlight ? 0.58 : 0.86;
        const color =
          mode === "day"
            ? overlayRgb(faceRgb, glass, 0.35)
            : overlayRgb(
                faceRgb,
                lit ? lightRgb : glass,
                lit ? lightAlpha : 0.35,
              );
        for (let i = 0; i < 4; i++) colors.push(color);
      }
    }
  }
  return colors;
}

export function allocTrailPoints(cubeCount: number): MutablePoint[] {
  const pts: MutablePoint[] = new Array(cubeCount * VERTS_PER_TRAIL);
  for (let i = 0; i < pts.length; i++) pts[i] = { x: 0, y: 0 };
  return pts;
}

export function buildTrailIndices(cubeCount: number): number[] {
  const idx: number[] = [];
  for (let c = 0; c < cubeCount; c++) {
    const b = c * VERTS_PER_TRAIL;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return idx;
}

export function buildTrailColorsStatic(cubes: Cube[], mode: "day" | "night") {
  const colors: string[] = [];
  for (const cu of cubes) {
    const cat = CATS[cu.catIndex];
    const rgb = mixTowardRgb(
      mode === "night" ? cat.darkColor : cat.color,
      0.18,
      NIGHT_MIX,
      0,
    );
    const color = rgbCss(rgb);
    for (let i = 0; i < VERTS_PER_TRAIL; i++) colors.push(color);
  }
  return colors;
}

const lerp = (a: number, b: number, f: number) => {
  "worklet";
  return a + (b - a) * f;
};

function clearVertices(
  points: MutablePoint[],
  index: number,
  count: number,
): number {
  "worklet";
  for (let k = 0; k < count; k++) {
    points[index].x = 0;
    points[index++].y = 0;
  }
  return index;
}

function writeQuad(
  points: MutablePoint[],
  index: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number {
  "worklet";
  points[index].x = x0;
  points[index++].y = y0;
  points[index].x = x1;
  points[index++].y = y1;
  points[index].x = x2;
  points[index++].y = y2;
  points[index].x = x3;
  points[index++].y = y3;
  return index;
}

function writeCubeFaces(
  points: MutablePoint[],
  index: number,
  t0x: number,
  t0y: number,
  t1x: number,
  t1y: number,
  t2x: number,
  t2y: number,
  t3x: number,
  t3y: number,
  ext: number,
): number {
  "worklet";
  index = writeQuad(
    points,
    index,
    t3x,
    t3y,
    t2x,
    t2y,
    t2x,
    t2y + ext,
    t3x,
    t3y + ext,
  );
  index = writeQuad(
    points,
    index,
    t2x,
    t2y,
    t1x,
    t1y,
    t1x,
    t1y + ext,
    t2x,
    t2y + ext,
  );
  return writeQuad(points, index, t0x, t0y, t1x, t1y, t2x, t2y, t3x, t3y);
}

function writeWindows(
  points: MutablePoint[],
  index: number,
  t1x: number,
  t1y: number,
  t2x: number,
  t2y: number,
  t3x: number,
  t3y: number,
  ext: number,
  d: number,
): number {
  "worklet";
  if (!ENABLE_CUBE_WINDOWS) {
    return clearVertices(points, index, WINDOWS_PER_CUBE * VERTS_PER_WINDOW);
  }

  const wa = clamp01((d - 0.6) / 0.4);
  if (wa <= 0.001) {
    return clearVertices(points, index, WINDOWS_PER_CUBE * VERTS_PER_WINDOW);
  }

  for (let face = 0; face < 2; face++) {
    const ax = face === 0 ? t2x : t3x;
    const ay = face === 0 ? t2y : t3y;
    const bx = face === 0 ? t1x : t2x;
    const by = face === 0 ? t1y : t2y;

    for (let wi = 0; wi < 2; wi++) {
      const uStart = 0.16 + wi * 0.44;
      const uEnd = uStart + 0.26;
      const uc = (uStart + uEnd) / 2;
      const u0 = uc + (uStart - uc) * wa;
      const u1 = uc + (uEnd - uc) * wa;
      const x0 = ax + (bx - ax) * u0;
      const y0 = ay + (by - ay) * u0;
      const x1 = ax + (bx - ax) * u1;
      const y1 = ay + (by - ay) * u1;
      const vc = 0.48 * ext;
      const v0 = vc + (0.28 * ext - vc) * wa;
      const v1 = vc + (0.68 * ext - vc) * wa;

      index = writeQuad(
        points,
        index,
        x0,
        y0 + v0,
        x1,
        y1 + v0,
        x1,
        y1 + v1,
        x0,
        y0 + v1,
      );
    }
  }
  return index;
}

function writeTrail(
  points: MutablePoint[],
  index: number,
  cu: Cube,
  x: number,
  y: number,
  p: number,
  vis: number,
  t: number,
): number {
  "worklet";
  if (!ENABLE_MOTION_TRAILS) {
    return clearVertices(points, index, VERTS_PER_TRAIL);
  }

  if (p <= 0.04 || p >= 0.85 || vis <= 0.9) {
    return clearVertices(points, index, VERTS_PER_TRAIL);
  }

  const prevP = clamp01((t - 0.0385 - cu.delay) / 0.55);
  const prevMp = easeOutBack(prevP) * cu.jitter + prevP * (1 - cu.jitter);
  const prevX = cu.ax + (cu.bx - cu.ax) * prevMp;
  const prevY =
    cu.ay + (cu.by - cu.ay) * prevMp - Math.sin(prevP * Math.PI) * 14;
  const dx = x - prevX;
  const dy = y - prevY;
  const dist = Math.hypot(dx, dy);
  if (dist <= 3) {
    return clearVertices(points, index, VERTS_PER_TRAIL);
  }

  const width = Math.min(14, Math.max(7, dist * 0.42));
  const nx = (-dy / dist) * width * 0.5;
  const ny = (dx / dist) * width * 0.5;
  return writeQuad(
    points,
    index,
    prevX + nx,
    prevY + ny,
    x + nx,
    y + ny,
    x - nx,
    y - ny,
    prevX - nx,
    prevY - ny,
  );
}

/* Single pass over all cubes, updating both cube faces and trail quads.
   Mutates cubePts and trailPts in place; returns void.
   Call with tVal < 1 (animation in progress). For tVal >= 1 use updateFromSettled. */
export function updateCubeAndTrailVertices(
  cubePts: MutablePoint[],
  trailPts: MutablePoint[],
  t: number,
  cubes: Cube[],
  visibleHeights?: readonly number[],
  includeTrails = true,
  selectedCatIndex = -1,
  selectedAmount = 0,
): void {
  "worklet";
  if (!ENABLE_CUBE_GEOMETRY_REWRITE) {
    return;
  }

  let i = 0;
  let ti = 0;
  for (let c = 0; c < cubes.length; c++) {
    const cu = cubes[c];
    const visibleHeight =
      visibleHeights !== undefined ? visibleHeights[cu.catIndex] : cu.hTot;
    const vis = clamp01(visibleHeight - cu.lvl);

    if (vis <= 0.005) {
      i = clearVertices(cubePts, i, VERTS_PER_CUBE);
      if (includeTrails) {
        ti = clearVertices(trailPts, ti, VERTS_PER_TRAIL);
      } else {
        ti += VERTS_PER_TRAIL;
      }
      continue;
    }

    let p = 0;
    let d = 0;
    let x = cu.ax;
    let y = cu.ay;
    const isSelected = cu.catIndex === selectedCatIndex;
    const selectedLift = isSelected ? selectedAmount : 0;
    const selectedStretch =
      isSelected ? 1 + selectedLift * 0.018 : 1;

    if (ENABLE_CUBE_MORPH_POSITION_MATH) {
      p = clamp01((t - cu.delay) / 0.55);
      const mp = easeOutBack(p) * cu.jitter + p * (1 - cu.jitter);
      d = smooth(p);
      const by =
        cu.by -
        cu.lvl * CUBE_H * (selectedStretch - 1) * d +
        selectedLift * 4 * d;
      x = cu.ax + (cu.bx - cu.ax) * mp;
      y = cu.ay + (by - cu.ay) * mp - Math.sin(p * Math.PI) * 14;
    }

    const vs = 0.35 + 0.65 * vis;
    const hs = (S / 2) * (1 - d * 0.06) * vs;
    const t0x = lerp(x - hs, x, d);
    const t0y = lerp(y - hs, y - TH, d);
    const t1x = lerp(x + hs, x + TW, d);
    const t1y = lerp(y - hs, y, d);
    const t2x = lerp(x + hs, x, d);
    const t2y = lerp(y + hs, y + TH, d);
    const t3x = lerp(x - hs, x - TW, d);
    const t3y = lerp(y + hs, y, d);
    const ext = d * CUBE_H * vis * (1 + (selectedStretch - 1) * d);

    i = writeCubeFaces(cubePts, i, t0x, t0y, t1x, t1y, t2x, t2y, t3x, t3y, ext);
    i = writeWindows(cubePts, i, t1x, t1y, t2x, t2y, t3x, t3y, ext, d);
    if (includeTrails) {
      ti = writeTrail(trailPts, ti, cu, x, y, p, vis, t);
    } else {
      ti += VERTS_PER_TRAIL;
    }
  }
}
