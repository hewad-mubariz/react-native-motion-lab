import type { Scene } from "@/hooks/useWebGPU";
import type { RefObject } from "react";
import { CATS, MORPH_MS, TH, TW } from "../constants";
import {
  allocCubePoints,
  allocTrailPoints,
  buildCubeColorsStatic,
  buildCubeIndices,
  buildGroundColorsStatic,
  buildGroundIndices,
  buildGroundVerticesStatic,
  buildIslandColors,
  buildIslandVertices,
  buildLayout,
  buildTrailColorsStatic,
  buildTrailIndices,
  GX0,
  GX1,
  GY0,
  GY1,
  heightsForMetric,
  isoX,
  isoY,
  TILE_DY,
  updateCubeAndTrailVertices,
  updateMetricHeights,
  VH,
  VW,
} from "../geometry";
import type { MetricKey } from "../types";

const GPU_BUFFER_USAGE = {
  COPY_DST: 8,
  VERTEX: 32,
} as const;

const FLOATS_PER_VERTEX = 6;
const TRIANGLE_VERTEX_COUNT = 3;
const METRIC_MORPH_MS = 1200;
const NIGHT_WAVE_MS = 850;
const ISLAND_INDICES = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];

type RGB = readonly [number, number, number];
type MeshColors = readonly RGB[];

export type ChartGpuControls = {
  activeMetricRef: RefObject<MetricKey>;
  cityBuiltRef: RefObject<boolean>;
  nightOnRef: RefObject<boolean>;
  selectedCatIndexRef: RefObject<number | null>;
};

const CLOUDS = [
  { x: 0.13, y: 0.08, s: 0.82 },
  { x: 0.5, y: 0.055, s: 0.62 },
  { x: 0.78, y: 0.11, s: 0.94 },
];
const ELLIPSE_SEGMENTS = 28;
const SKY_VERTEX_COUNT = 6 + (1 + CLOUDS.length * 3 + 1) * ELLIPSE_SEGMENTS * 3;

const shaderCode = /* wgsl */ `
struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vertexMain(
  @location(0) position: vec2f,
  @location(1) color: vec4f,
) -> VertexOut {
  var out: VertexOut;
  out.position = vec4f(position, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fragmentMain(in: VertexOut) -> @location(0) vec4f {
  return in.color;
}
`;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, f: number) => a + (b - a) * f;
const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

const mixRgb = (a: RGB, b: RGB, f: number): RGB =>
  [
    mix(a[0], b[0], f),
    mix(a[1], b[1], f),
    mix(a[2], b[2], f),
  ] as const;

const parseColor = (color: string): RGB => {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
  }

  const match = color.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) {
    return [1, 1, 1] as const;
  }

  return [
    Number(match[0]) / 255,
    Number(match[1]) / 255,
    Number(match[2]) / 255,
  ] as const;
};

const parseColors = (colors: readonly string[]): MeshColors =>
  colors.map(parseColor);

const writeMeshTriangles = (
  output: Float32Array,
  offset: number,
  points: readonly { x: number; y: number }[],
  colors: MeshColors,
  indices: readonly number[],
  alpha: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number,
  translateY = 0,
  nightColors?: MeshColors,
  nightProgress = 0,
) => {
  let out = offset;
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    const point = points[index];
    const color =
      nightColors && nightProgress > 0
        ? mixRgb(colors[index], nightColors[index], nightProgress)
        : colors[index];
    const x = offsetX + point.x * scale;
    const y = offsetY + (point.y + translateY) * scale;
    output[out++] = (x / canvasWidth) * 2 - 1;
    output[out++] = 1 - (y / canvasHeight) * 2;
    output[out++] = color[0];
    output[out++] = color[1];
    output[out++] = color[2];
    output[out++] = alpha;
  }
  return out;
};

const writePoint = (
  output: Float32Array,
  offset: number,
  x: number,
  y: number,
  color: RGB,
  alpha: number,
  canvasWidth: number,
  canvasHeight: number,
) => {
  output[offset] = (x / canvasWidth) * 2 - 1;
  output[offset + 1] = 1 - (y / canvasHeight) * 2;
  output[offset + 2] = color[0];
  output[offset + 3] = color[1];
  output[offset + 4] = color[2];
  output[offset + 5] = alpha;
  return offset + FLOATS_PER_VERTEX;
};

const writeSolidQuad = (
  output: Float32Array,
  offset: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: RGB,
  alpha: number,
  canvasWidth: number,
  canvasHeight: number,
) => {
  const points = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y],
    [x + width, y + height],
    [x, y + height],
  ] as const;
  let out = offset;
  for (const point of points) {
    out = writePoint(
      output,
      out,
      point[0],
      point[1],
      color,
      alpha,
      canvasWidth,
      canvasHeight,
    );
  }
  return out;
};

const writeEllipse = (
  output: Float32Array,
  offset: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGB,
  alpha: number,
  canvasWidth: number,
  canvasHeight: number,
) => {
  let out = offset;
  for (let i = 0; i < ELLIPSE_SEGMENTS; i++) {
    const a0 = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / ELLIPSE_SEGMENTS) * Math.PI * 2;
    out = writePoint(output, out, cx, cy, color, alpha, canvasWidth, canvasHeight);
    out = writePoint(
      output,
      out,
      cx + Math.cos(a0) * rx,
      cy + Math.sin(a0) * ry,
      color,
      alpha,
      canvasWidth,
      canvasHeight,
    );
    out = writePoint(
      output,
      out,
      cx + Math.cos(a1) * rx,
      cy + Math.sin(a1) * ry,
      color,
      alpha,
      canvasWidth,
      canvasHeight,
    );
  }
  return out;
};

const writeSkyPrimitives = (
  output: Float32Array,
  offset: number,
  canvasWidth: number,
  canvasHeight: number,
  nightProgress: number,
  groundT: number,
  scale: number,
  sceneOffsetX: number,
  sceneOffsetY: number,
) => {
  let out = offset;
  const dayAmount = 1 - nightProgress;
  if (dayAmount > 0.001) {
    out = writeSolidQuad(
      output,
      out,
      0,
      canvasHeight * 0.35,
      canvasWidth,
      canvasHeight * 0.65,
      parseColor("#F5EDE1"),
      0.56 * dayAmount,
      canvasWidth,
      canvasHeight,
    );
    out = writeEllipse(
      output,
      out,
      canvasWidth * 0.22,
      canvasHeight * 0.13,
      Math.max(canvasWidth, canvasHeight) * 0.18,
      Math.max(canvasWidth, canvasHeight) * 0.18,
      parseColor("#FFF6E0"),
      0.36 * dayAmount,
      canvasWidth,
      canvasHeight,
    );
    for (const cloud of CLOUDS) {
      const cx = cloud.x * canvasWidth;
      const cy = cloud.y * Math.min(canvasHeight, 720);
      const s = cloud.s;
      out = writeEllipse(output, out, cx, cy, 28 * s, 9 * s, [1, 1, 1], 0.46 * dayAmount, canvasWidth, canvasHeight);
      out = writeEllipse(output, out, cx + 20 * s, cy + 3 * s, 20 * s, 7.5 * s, [1, 1, 1], 0.38 * dayAmount, canvasWidth, canvasHeight);
      out = writeEllipse(output, out, cx - 18 * s, cy + 4 * s, 17 * s, 7 * s, [1, 1, 1], 0.34 * dayAmount, canvasWidth, canvasHeight);
    }
  } else {
    const clearTo =
      out +
      (6 + (1 + CLOUDS.length * 3) * ELLIPSE_SEGMENTS * 3) *
        FLOATS_PER_VERTEX;
    output.fill(0, out, clearTo);
    out = clearTo;
  }

  const shLeft = isoX(GX0, GY1) - TW;
  const shRight = isoX(GX1, GY0) + TW;
  const shBottom = isoY(GX1, GY1, 0) + TILE_DY + TH + 18;
  const shadowX = sceneOffsetX + ((shLeft + shRight) / 2) * scale;
  const shadowY = sceneOffsetY + (shBottom + 12) * scale;
  out = writeEllipse(
    output,
    out,
    shadowX,
    shadowY,
    ((shRight - shLeft) * 0.92 * 0.5) * scale,
    12 * scale,
    mixRgb([0.12, 0.086, 0.14], [0.02, 0.016, 0.04], nightProgress),
    groundT * mix(0.1, 0.24, nightProgress),
    canvasWidth,
    canvasHeight,
  );
  return out;
};

const writeAxis = (
  output: Float32Array,
  offset: number,
  alpha: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  canvasWidth: number,
  canvasHeight: number,
  nightProgress: number,
) => {
  const color = mixRgb(parseColor("#D8CFC4"), parseColor("#4F445B"), nightProgress);
  const x = offsetX + 134 * scale;
  const y = offsetY + 440 * scale;
  const w = 452 * scale;
  const h = 2 * scale;
  const points = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const indices = [0, 1, 2, 0, 2, 3];
  return writeMeshTriangles(
    output,
    offset,
    points,
    [color, color, color, color],
    indices,
    alpha,
    1,
    0,
    0,
    canvasWidth,
    canvasHeight,
  );
};

export const makeChartGpuScene = (controls: ChartGpuControls): Scene => {
  return ({ context, device, presentationFormat, canvas }) => {
    const layouts = Object.fromEntries(
      (["wait", "volume", "digital"] as MetricKey[]).map((metric) => [
        metric,
        buildLayout(metric),
      ]),
    ) as Record<MetricKey, ReturnType<typeof buildLayout>>;
    const maxHeights = CATS.map((_, i) =>
      Math.max(...(["wait", "volume", "digital"] as MetricKey[]).map((m) => layouts[m].heights[i])),
    );
    const layout = buildLayout("wait", maxHeights);

    const groundPoints = buildGroundVerticesStatic(layout.tiles);
    const groundIndices = buildGroundIndices(layout.tiles.length);
    const groundDayColors = parseColors(
      buildGroundColorsStatic(layout.tiles, "day"),
    );
    const groundNightColors = parseColors(
      buildGroundColorsStatic(layout.tiles, "night"),
    );
    const islandPoints = buildIslandVertices();
    const islandDayColors = parseColors(buildIslandColors("#D0BAA4", "#B69C86"));
    const islandNightColors = parseColors(
      buildIslandColors("#4A3E54", "#352C40"),
    );
    const cubePoints = allocCubePoints(layout.cubes.length);
    const trailPoints = allocTrailPoints(layout.cubes.length);
    const cubeIndices = buildCubeIndices(layout.cubes.length);
    const trailIndices = buildTrailIndices(layout.cubes.length);
    const trailFloatCount = trailIndices.length * FLOATS_PER_VERTEX;
    const cubeDayColors = parseColors(buildCubeColorsStatic(layout.cubes, "day"));
    const cubeNightColors = parseColors(
      buildCubeColorsStatic(layout.cubes, "night"),
    );
    const cubeNightSelectedColors = CATS.map((_, catIndex) =>
      parseColors(buildCubeColorsStatic(layout.cubes, "night", catIndex)),
    );
    const trailDayColors = parseColors(
      buildTrailColorsStatic(layout.cubes, "day"),
    );
    const trailNightColors = parseColors(
      buildTrailColorsStatic(layout.cubes, "night"),
    );

    const vertexCount =
      SKY_VERTEX_COUNT +
      groundIndices.length +
      ISLAND_INDICES.length +
      cubeIndices.length +
      trailIndices.length +
      2 * TRIANGLE_VERTEX_COUNT;
    const vertexData = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
    const vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
    });

    const shader = device.createShaderModule({ code: shaderCode });
    const pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              {
                shaderLocation: 1,
                offset: 2 * Float32Array.BYTES_PER_ELEMENT,
                format: "float32x4",
              },
            ],
          },
        ],
      },
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

    let currentMetric = controls.activeMetricRef.current;
    let fromHeights = heightsForMetric(currentMetric);
    let toHeights = [...fromHeights];
    let visibleHeights = [...fromHeights];
    let metricStartedAt = 0;
    let currentCityBuilt = controls.cityBuiltRef.current;
    let fromCityProgress = currentCityBuilt ? 1 : 0;
    let toCityProgress = fromCityProgress;
    let cityProgress = fromCityProgress;
    let cityStartedAt = 0;
    let currentNightOn = controls.nightOnRef.current;
    let fromNightProgress = currentNightOn ? 1 : 0;
    let toNightProgress = fromNightProgress;
    let nightProgress = fromNightProgress;
    let nightStartedAt = 0;
    let lastCanvasWidth = 0;
    let lastCanvasHeight = 0;
    let needsDraw = true;
    let dynamicFloatOffset = 0;
    let currentSelectedCatIndex = controls.selectedCatIndexRef.current ?? -1;
    let selectedStartedAt = 0;

    updateCubeAndTrailVertices(
      cubePoints,
      trailPoints,
      cityProgress,
      layout.cubes,
      visibleHeights,
      false,
    );

    return (timestamp: number) => {
      const nextMetric = controls.activeMetricRef.current;
      let metricChanged = false;
      let cityChanged = false;
      let nightChanged = false;
      let sizeChanged = false;
      let selectedChanged = false;
      if (nextMetric !== currentMetric) {
        currentMetric = nextMetric;
        fromHeights = [...visibleHeights];
        toHeights = heightsForMetric(nextMetric);
        metricStartedAt = timestamp;
        metricChanged = true;
      }

      const nextCityBuilt = controls.cityBuiltRef.current;
      if (nextCityBuilt !== currentCityBuilt) {
        currentCityBuilt = nextCityBuilt;
        fromCityProgress = cityProgress;
        toCityProgress = nextCityBuilt ? 1 : 0;
        cityStartedAt = timestamp;
        cityChanged = true;
      }

      const nextNightOn = controls.nightOnRef.current;
      if (nextNightOn !== currentNightOn) {
        currentNightOn = nextNightOn;
        fromNightProgress = nightProgress;
        toNightProgress = nextNightOn ? 1 : 0;
        nightStartedAt = timestamp;
        nightChanged = true;
      }

      const nextSelectedCatIndex = controls.selectedCatIndexRef.current ?? -1;
      if (nextSelectedCatIndex !== currentSelectedCatIndex) {
        currentSelectedCatIndex = nextSelectedCatIndex;
        selectedStartedAt = timestamp;
        selectedChanged = true;
      }

      if (canvas.width !== lastCanvasWidth || canvas.height !== lastCanvasHeight) {
        lastCanvasWidth = canvas.width;
        lastCanvasHeight = canvas.height;
        sizeChanged = true;
      }

      const metricProgress = clamp01((timestamp - metricStartedAt) / METRIC_MORPH_MS);
      const metricAnimating = metricProgress < 1;
      const cityElapsed = clamp01((timestamp - cityStartedAt) / MORPH_MS);
      const cityAnimating = cityElapsed < 1;
      const nightElapsed = clamp01((timestamp - nightStartedAt) / NIGHT_WAVE_MS);
      const nightAnimating = nightElapsed < 1;
      const selectedElapsed = Math.max(0, (timestamp - selectedStartedAt) / 1000);
      const selectedAnimating =
        selectedChanged ||
        (currentSelectedCatIndex >= 0 && selectedElapsed < 0.9);

      if (
        !needsDraw &&
        !metricChanged &&
        !cityChanged &&
        !nightChanged &&
        !sizeChanged &&
        !selectedChanged &&
        !metricAnimating &&
        !cityAnimating &&
        !nightAnimating &&
        !selectedAnimating
      ) {
        return;
      }

      updateMetricHeights(
        visibleHeights,
        fromHeights,
        toHeights,
        metricProgress,
      );

      const cityEase = cityElapsed;
      cityProgress = mix(fromCityProgress, toCityProgress, cityEase);
      nightProgress = mix(
        fromNightProgress,
        toNightProgress,
        easeInOutCubic(nightElapsed),
      );
      const selectedPulse =
        currentSelectedCatIndex >= 0
          ? selectedAnimating
            ? 1 + Math.sin(selectedElapsed * 10) * Math.exp(-selectedElapsed * 5) * 0.45
            : 1
          : 0;
      updateCubeAndTrailVertices(
        cubePoints,
        trailPoints,
        cityProgress,
        layout.cubes,
        visibleHeights,
        cityAnimating,
        currentSelectedCatIndex,
        selectedPulse,
      );

      const scale = Math.min(canvas.width / VW, canvas.height / VH) * 1.32;
      const offsetX = (canvas.width - VW * scale) / 2;
      const offsetY = (canvas.height - VH * scale) / 2;
      const groundT = smooth(clamp01((cityProgress - 0.6) / 0.35));
      const axisAlpha = 1 - smooth(clamp01(cityProgress / 0.45));
      const groundAlpha = 0.97 * groundT;
      const groundRise = (1 - groundT) * 16;
      const shouldRewriteStatic =
        needsDraw ||
        cityChanged ||
        cityAnimating ||
        nightChanged ||
        nightAnimating ||
        sizeChanged;
      let offset = shouldRewriteStatic ? 0 : dynamicFloatOffset;

      if (shouldRewriteStatic) {
        offset = writeSkyPrimitives(
          vertexData,
          offset,
          canvas.width,
          canvas.height,
          nightProgress,
          groundT,
          scale,
          offsetX,
          offsetY,
        );
        offset = writeMeshTriangles(
          vertexData,
          offset,
          islandPoints,
          islandDayColors,
          ISLAND_INDICES,
          groundAlpha,
          scale,
          offsetX,
          offsetY,
          canvas.width,
          canvas.height,
          groundRise,
          islandNightColors,
          nightProgress,
        );
        offset = writeMeshTriangles(
          vertexData,
          offset,
          groundPoints,
          groundDayColors,
          groundIndices,
          groundAlpha,
          scale,
          offsetX,
          offsetY,
          canvas.width,
          canvas.height,
          groundRise,
          groundNightColors,
          nightProgress,
        );
        offset = writeAxis(
          vertexData,
          offset,
          axisAlpha,
          scale,
          offsetX,
          offsetY,
          canvas.width,
          canvas.height,
          nightProgress,
        );
        dynamicFloatOffset = offset;
      }

      if (cityAnimating) {
        offset = writeMeshTriangles(
          vertexData,
          offset,
          trailPoints,
          trailDayColors,
          trailIndices,
          mix(0.26, 0.3, nightProgress),
          scale,
          offsetX,
          offsetY,
          canvas.width,
          canvas.height,
          0,
          trailNightColors,
          nightProgress,
        );
      } else {
        vertexData.fill(0, offset, offset + trailFloatCount);
        offset += trailFloatCount;
      }
      offset = writeMeshTriangles(
        vertexData,
        offset,
        cubePoints,
        cubeDayColors,
        cubeIndices,
        1,
        scale,
        offsetX,
        offsetY,
        canvas.width,
        canvas.height,
        0,
        currentSelectedCatIndex >= 0
          ? cubeNightSelectedColors[currentSelectedCatIndex]
          : cubeNightColors,
        nightProgress,
      );
      vertexData.fill(0, offset);
      if (shouldRewriteStatic) {
        device.queue.writeBuffer(vertexBuffer, 0, vertexData as BufferSource);
      } else {
        device.queue.writeBuffer(
          vertexBuffer,
          dynamicFloatOffset * Float32Array.BYTES_PER_ELEMENT,
          vertexData.subarray(dynamicFloatOffset) as BufferSource,
        );
      }

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: {
              r: mix(0.984 - groundT * 0.02, 0.145, nightProgress),
              g: mix(0.969 - groundT * 0.035, 0.118, nightProgress),
              b: mix(0.949 - groundT * 0.055, 0.188, nightProgress),
              a: 1,
            },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });

      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.draw(vertexCount);
      pass.end();
      device.queue.submit([encoder.finish()]);
      needsDraw = selectedAnimating || nightAnimating;
    };
  };
};
