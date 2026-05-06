import type { BirdsShapeTool } from "@/components/birds-toolbar";
import { BIRD_COUNT, FLOATS_PER_VEC4 } from "./constants";
import {
  FONT_5X7,
  FONT_GLYPH_ADVANCE,
  FONT_GLYPH_HEIGHT,
  FONT_SPACE_ADVANCE,
} from "./font";

interface Point {
  x: number;
  y: number;
}

const HEART_SAMPLES = 520;
const MOON_SAMPLES = 1800;
const STAR_CORNER_COUNT = 10;
const STAR_SEGMENT_SAMPLES = 42;
const SHAPE_JITTER = 0.018;

/**
 * Distributes `BIRD_COUNT` target positions over the given `points`, repeating
 * them as needed and adding small jitter so the formation looks organic.
 */
const createPointTargets = (points: Point[], jitter: number): Float32Array => {
  const targetData = new Float32Array(BIRD_COUNT * FLOATS_PER_VEC4);
  const safePoints = points.length > 0 ? points : [{ x: 0, y: 0 }];

  for (let i = 0; i < BIRD_COUNT; i++) {
    const point = safePoints[i % safePoints.length];
    targetData[i * FLOATS_PER_VEC4 + 0] =
      point.x + (Math.random() - 0.5) * jitter;
    targetData[i * FLOATS_PER_VEC4 + 1] =
      point.y + (Math.random() - 0.5) * jitter;
    targetData[i * FLOATS_PER_VEC4 + 2] = 0;
    targetData[i * FLOATS_PER_VEC4 + 3] = 1;
  }

  return targetData;
};

const createNameTargets = (name: string, aspectScale: number): Float32Array => {
  const chars = name
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .slice(0, 12);
  const pixels: Point[] = [];
  let cursor = 0;

  for (const char of chars) {
    if (char === " ") {
      cursor += FONT_SPACE_ADVANCE;
      continue;
    }

    const glyph = FONT_5X7[char];
    if (!glyph) {
      continue;
    }

    glyph.forEach((row, y) => {
      row.split("").forEach((cell, x) => {
        if (cell === "1") {
          pixels.push({ x: cursor + x, y });
        }
      });
    });
    cursor += FONT_GLYPH_ADVANCE;
  }

  const width = Math.max(cursor - 1, 1);
  const textScale = Math.min(
    1.75 / width,
    (aspectScale * 0.9) / FONT_GLYPH_HEIGHT,
  );
  const points = pixels.map((pixel) => ({
    x: (pixel.x - width / 2) * textScale,
    y: (FONT_GLYPH_HEIGHT / 2 - pixel.y) * textScale * aspectScale,
  }));

  return createPointTargets(points, textScale * 0.26);
};

const createHeartTargets = (aspectScale: number): Float32Array => {
  const points: Point[] = [];

  for (let i = 0; i < HEART_SAMPLES; i++) {
    const t = (i / HEART_SAMPLES) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);

    points.push({ x: x * 0.035, y: (y - 2) * 0.035 * aspectScale });
  }

  return createPointTargets(points, SHAPE_JITTER);
};

const createMoonTargets = (aspectScale: number): Float32Array => {
  const points: Point[] = [];

  const outerRadius = 0.66;
  const innerRadius = 0.53;
  const offsetX = 0.2;
  const outerRadiusSq = outerRadius * outerRadius;
  const innerRadiusSq = innerRadius * innerRadius;

  for (let i = 0; i < MOON_SAMPLES; i++) {
    const radius = Math.sqrt(Math.random()) * outerRadius;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const innerDistanceSquared = (x - offsetX) * (x - offsetX) + y * y;

    if (x * x + y * y <= outerRadiusSq && innerDistanceSquared >= innerRadiusSq) {
      points.push({ x, y: y * aspectScale });
    }
  }

  return createPointTargets(points, SHAPE_JITTER * 0.75);
};

const createStarTargets = (aspectScale: number): Float32Array => {
  const corners = Array.from({ length: STAR_CORNER_COUNT }, (_, i) => {
    const radius = i % 2 === 0 ? 0.68 : 0.3;
    const angle = -Math.PI / 2 + (i / STAR_CORNER_COUNT) * Math.PI * 2;

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * aspectScale,
    };
  });
  const points: Point[] = [];

  for (let i = 0; i < corners.length; i++) {
    const from = corners[i];
    const to = corners[(i + 1) % corners.length];

    for (let j = 0; j < STAR_SEGMENT_SAMPLES; j++) {
      const t = j / STAR_SEGMENT_SAMPLES;
      points.push({
        x: from.x * (1 - t) + to.x * t,
        y: from.y * (1 - t) + to.y * t,
      });
    }
  }

  return createPointTargets(points, SHAPE_JITTER);
};

export const createFormationTargets = (
  shape: BirdsShapeTool,
  name: string,
  aspectScale: number,
): Float32Array => {
  switch (shape) {
    case "heart":
      return createHeartTargets(aspectScale);
    case "star":
      return createStarTargets(aspectScale);
    case "moon":
      return createMoonTargets(aspectScale);
    case "text":
    default:
      return createNameTargets(name, aspectScale);
  }
};
