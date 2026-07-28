import type { Scene as WebGpuScene } from "@/hooks/useWebGPU";
import type { RefObject } from "react";
import * as THREE from "three/webgpu";

export type StadiumSeatState = "free" | "taken" | "mine";

export type StadiumSeat = {
  section: number;
  row: number;
  col: number;
  label: string;
  state: StadiumSeatState;
  shake: number;
};

export type ProjectedStadiumSeat = {
  index: number;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  normalX: number;
  normalZ: number;
  radiusX: number;
  radiusY: number;
  depth: number;
  visible: boolean;
  state: StadiumSeatState;
};

export type StadiumOrbit = {
  theta: number;
  phi: number;
  radius: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  ringAngle: number; // which section the section-camera faces (radians)
  rowHeight: number; // 0 = lower rows, 1 = upper rows
};

export type StadiumCameraSnapshot = {
  viewProjection: Float32Array;
  x: number;
  y: number;
  z: number;
  ready: boolean;
};

export type StadiumSelectionControls = {
  seatsRef: RefObject<StadiumSeat[]>;
  orbitRef: RefObject<StadiumOrbit>;
  cameraSnapshotRef: RefObject<StadiumCameraSnapshot>;
  projectedSeatsRef: RefObject<ProjectedStadiumSeat[]>;
  dirtySeatIndicesRef: RefObject<Set<number>>;
  isPinchingRef: RefObject<boolean>;
};

type SeatGeometryValues = {
  panFront: number;
  panBack: number;
  backTopZ: number;
  panY: number;
  backTopY: number;
  faceBake: readonly [number, number, number, number, number, number, number, number];
};

type SeatLayout = {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  tx: number;
  tz: number;
  projected: ProjectedStadiumSeat;
};

const SECTIONS = 28;
const ROWS = 45;
const COLS = 48;
const SEAT_COUNT = SECTIONS * ROWS * COLS;
const SELECTED_HIGHLIGHT_COUNT = 120;
const PRICE = 45;
const CAMERA_TARGET = new THREE.Vector3(0, 6, 0);
const SEAT_VERTICES = 48;
const H_FOV_RAD = 60 * (Math.PI / 180);
const ARC_STEPS = 128;
const FAR_LOD_SEAT_PIXELS = 1.8;
const DETAIL_LOD_SEAT_PIXELS = 2.8;

const COLORS = {
  background: new THREE.Color(0x0e0f12),
  pitchDark: 0x26772d,
  pitchLight: 0x2c8434,
  apron: 0x101319,
  concrete: 0x7d7568,
  concreteEdge: 0x9a9282,
  selectedTint: new THREE.Color(0x39e6ff),
} as const;

// [0]=blue  [1]=green  [2]=purple  [3]=orange  [4]=red (main-stand accent)
// Colors are pre-tonemapped sRGB — slightly over-saturated so ACES compression lands vivid.
const SECTION_COLORS = [
  new THREE.Color(0x1a55ff),  // vivid royal blue
  new THREE.Color(0x10d050),  // vivid emerald green
  new THREE.Color(0x9933ff),  // vivid violet
  new THREE.Color(0xff8c00),  // vivid amber orange
  new THREE.Color(0xff1a3a),  // vivid crimson
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const superEllipsePoint = (theta: number, a: number, b: number, n: number) => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;
  const x = a * Math.sign(c) * Math.abs(c) ** e;
  const z = b * Math.sign(s) * Math.abs(s) ** e;
  let nx = (Math.abs(x / a) ** (n - 1) * Math.sign(x)) / a;
  let nz = (Math.abs(z / b) ** (n - 1) * Math.sign(z)) / b;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  return { x, z, nx, nz };
};

// Classify each section as end (behind goal) / side (touchline) / corner.
const SECTION_CLASS = Array.from({ length: SECTIONS }, (_, k) => {
  const theta = ((k + 0.5) / SECTIONS) * Math.PI * 2;
  const q = superEllipsePoint(theta, 40, 27, 4);
  return Math.abs(q.x) / 40 > 0.88 ? 'end' : Math.abs(q.z) / 27 > 0.88 ? 'side' : 'corner';
}) as readonly ('end' | 'side' | 'corner')[];

// +z side = main stand touchline, used for the red accent strip on lower-front rows.
const SECTION_Z_SIGN = Array.from({ length: SECTIONS }, (_, k) => {
  const theta = ((k + 0.5) / SECTIONS) * Math.PI * 2;
  return Math.sign(superEllipsePoint(theta, 40, 27, 4).z) || 1;
});

// Corner sections have shorter arc-length per section span, so give them fewer columns
// to keep seat width consistent with end/side sections.
const SECTION_ACTIVE_COLS = SECTION_CLASS.map(c => c === 'corner' ? 36 : COLS);

const zoneColorForSeat = (section: number, row: number): THREE.Color => {
  if (row >= 26) {
    return SECTION_CLASS[section] === 'corner' ? SECTION_COLORS[3] : SECTION_COLORS[2];
  }
  const isFront = row < 13;
  if (isFront && SECTION_CLASS[section] === 'side' && SECTION_Z_SIGN[section] > 0) {
    return SECTION_COLORS[4];
  }
  return isFront ? SECTION_COLORS[0] : SECTION_COLORS[1];
};

const seededNoise = (a: number, b: number, c: number) => {
  const n = Math.sin(a * 17.17 + b * 9.31 + c * 5.13) * 43758.5453;
  return n - Math.floor(n);
};

const mixColor = (a: number[], b: number[], t: number) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const hexToRgb = (hex: number) => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

const rectBorderDistance = (x: number, z: number, halfW: number, halfH: number) => {
  const dx = Math.abs(x) - halfW;
  const dz = Math.abs(z) - halfH;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dz, 0));
  const inside = Math.min(Math.max(dx, dz), 0);
  return Math.abs(outside + inside);
};

const makePitchTexture = () => {
  const scale = 16;
  const worldW = 66;
  const worldH = 44;
  const width = worldW * scale;
  const height = worldH * scale;
  const data = new Uint8Array(width * height * 4);
  const apron = hexToRgb(0x1a1d23);
  const grass = hexToRgb(0x2c8434);
  const stripe = hexToRgb(0x26772d);
  const white = hexToRgb(0xf2f2f2);
  const grassHalfW = 32.7;
  const grassHalfH = 21.6;
  const pitchHalfL = 31.5;
  const pitchHalfW = 20.4;
  const lineWidth = 0.07;

  for (let py = 0; py < height; py += 1) {
    const z = py / scale - worldH / 2;
    for (let px = 0; px < width; px += 1) {
      const x = px / scale - worldW / 2;
      const inGrass = Math.abs(x) <= grassHalfW && Math.abs(z) <= grassHalfH;
      const rhythm = ((x + worldW / 2) % 8 + 8) % 8;
      let color = inGrass ? (rhythm < 5.4 ? stripe : grass) : apron;

      const edge = rectBorderDistance(x, z, grassHalfW, grassHalfH);
      if (edge < 1.4) {
        color = mixColor(color, [0, 0, 0], (1.4 - edge) * 0.12);
      }

      let line = rectBorderDistance(x, z, pitchHalfL, pitchHalfW) < lineWidth;
      line ||= Math.abs(x) < lineWidth && Math.abs(z) <= pitchHalfW;
      line ||= Math.abs(Math.hypot(x, z) - 5.49) < lineWidth;
      line ||= Math.hypot(x, z) < 0.16;

      for (const side of [-1, 1]) {
        const gl = side * pitchHalfL;
        const penaltyCenterX = gl - side * 9.9 * 0.5;
        const goalCenterX = gl - side * 3.3 * 0.5;
        line ||= rectBorderDistance(x - penaltyCenterX, z, 9.9 * 0.5, 12.1) < lineWidth;
        line ||= rectBorderDistance(x - goalCenterX, z, 3.3 * 0.5, 5.5) < lineWidth;
        line ||= Math.hypot(x - (gl - side * 6.6), z) < 0.14;

        const spotX = gl - side * 6.6;
        const arcDist = Math.abs(Math.hypot(x - spotX, z) - 5.49);
        const outsideBox = side < 0 ? x > gl + 9.9 : x < gl - 9.9;
        line ||= outsideBox && arcDist < lineWidth;
      }

      if (line) {
        color = mixColor(color, white, 0.9);
      }

      const offset = (py * width + px) * 4;
      data[offset] = Math.round(clamp(color[0], 0, 1) * 255);
      data[offset + 1] = Math.round(clamp(color[1], 0, 1) * 255);
      data[offset + 2] = Math.round(clamp(color[2], 0, 1) * 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
};

const freezeObject = (object: THREE.Object3D) => {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
};

const makeGoal = (x: number) => {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.42 });
  const postGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.55, 10);
  for (const z of [-2.25, 2.25]) {
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(0, 0.78, z);
    group.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.55, 10), mat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0, 1.55, 0);
  group.add(bar);
  group.position.set(x, 0, 0);
  return group;
};

const makeSweptProfileGeometry = (profile: [number, number][], segments = 160) => {
  const columns = profile.length;
  const positions = new Float32Array((segments + 1) * columns * 3);
  let cursor = 0;
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const q = superEllipsePoint(theta, 40, 27, 4);
    for (const [off, y] of profile) {
      positions[cursor] = q.x + q.nx * off;
      positions[cursor + 1] = y;
      positions[cursor + 2] = q.z + q.nz * off;
      cursor += 3;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < columns - 1; j += 1) {
      const a = i * columns + j;
      const b = (i + 1) * columns + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const makeTierSteps = (rows: number, baseH: number, baseOff: number) => {
  const points: [number, number][] = [];
  for (let row = 0; row < rows; row += 1) {
    const off = baseOff + row * 0.82;
    const y = baseH + row * 0.46;
    points.push([off - 0.45, y], [off + 0.37, y]);
  }
  return points;
};

const makeSeatPatternTexture = () => {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size - 0.5;
      const py = (y + 0.5) / size - 0.5;
      const dx = Math.abs(px) - 0.31;
      const dy = Math.abs(py + 0.015) - 0.29;
      const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
      const inside = Math.min(Math.max(dx, dy), 0);
      const roundedDistance = outside + inside - 0.055;
      const coverage = clamp(0.5 - roundedDistance * size, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(coverage * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

const makeFarSeatGeometry = () => {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const bands = [
    { firstRow: 0, lastRow: 12, baseOffset: 0, baseHeight: 1.2 },
    { firstRow: 13, lastRow: 25, baseOffset: 0, baseHeight: 1.2 },
    { firstRow: 26, lastRow: 44, baseOffset: 23, baseHeight: 16 },
  ] as const;
  const curveSegments = 8;

  const appendVertex = (
    theta: number,
    offset: number,
    y: number,
    u: number,
    v: number,
    seatColor: THREE.Color,
  ) => {
    const q = superEllipsePoint(theta, 40, 27, 4);
    positions.push(q.x + q.nx * offset, y, q.z + q.nz * offset);
    uvs.push(u, v);
    colors.push(seatColor.r, seatColor.g, seatColor.b);
  };

  for (let section = 0; section < SECTIONS; section += 1) {
    const sectionStart = (section / SECTIONS) * Math.PI * 2;
    const sectionSpan = (Math.PI * 2) / SECTIONS;
    const sectionCols = SECTION_ACTIVE_COLS[section];
    for (const band of bands) {
      const upperTier = band.firstRow >= 26;
      const tierFirstRow = upperTier ? band.firstRow - 26 : band.firstRow;
      const tierLastRow = upperTier ? band.lastRow - 26 : band.lastRow;
      const rowCount = tierLastRow - tierFirstRow + 1;
      const innerOffset = band.baseOffset + tierFirstRow * 0.82 - 0.36;
      const outerOffset = band.baseOffset + tierLastRow * 0.82 + 0.36;
      const innerY = band.baseHeight + tierFirstRow * 0.46 + 0.32;
      const outerY = band.baseHeight + tierLastRow * 0.46 + 0.32;
      const seatColor =
        zoneColorForSeat(section, band.firstRow) ?? SECTION_COLORS[0];

      for (let segment = 0; segment < curveSegments; segment += 1) {
        const segment0 = segment / curveSegments;
        const segment1 = (segment + 1) / curveSegments;
        const theta0 = sectionStart + sectionSpan * (0.08 + segment0 * 0.84);
        const theta1 = sectionStart + sectionSpan * (0.08 + segment1 * 0.84);
        const u0 = segment0 * sectionCols;
        const u1 = segment1 * sectionCols;
        appendVertex(theta0, innerOffset, innerY, u0, 0, seatColor);
        appendVertex(theta1, innerOffset, innerY, u1, 0, seatColor);
        appendVertex(theta1, outerOffset, outerY, u1, rowCount, seatColor);
        appendVertex(theta0, innerOffset, innerY, u0, 0, seatColor);
        appendVertex(theta1, outerOffset, outerY, u1, rowCount, seatColor);
        appendVertex(theta0, outerOffset, outerY, u0, rowCount, seatColor);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(colors, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
};

type StadiumTier = {
  rows: number;
  baseHeight: number;
  baseOffset: number;
};

const STADIUM_TIERS: readonly StadiumTier[] = [
  { rows: 26, baseHeight: 1.2, baseOffset: 0 },
  { rows: 19, baseHeight: 16, baseOffset: 23 },
];

const makeAisleStepGeometry = () => {
  const positions: number[] = [];
  const appendQuad = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
  ) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let section = 0; section < SECTIONS; section += 1) {
    const theta = (section / SECTIONS) * Math.PI * 2;
    const q = superEllipsePoint(theta, 40, 27, 4);
    const tx = -q.nz;
    const tz = q.nx;
    for (const tier of STADIUM_TIERS) {
      for (let row = 0; row < tier.rows; row += 1) {
        const offset = tier.baseOffset + row * 0.82;
        const y = tier.baseHeight + row * 0.46 + 0.045;
        const cx = q.x + q.nx * offset;
        const cz = q.z + q.nz * offset;
        const halfWidth = 0.42;
        const halfDepth = 0.41;
        const point = (
          side: number,
          depth: number,
          pointY = y,
        ): [number, number, number] => [
          cx + tx * side + q.nx * depth,
          pointY,
          cz + tz * side + q.nz * depth,
        ];
        const a = point(-halfWidth, -halfDepth);
        const b = point(halfWidth, -halfDepth);
        const c = point(halfWidth, halfDepth);
        const d = point(-halfWidth, halfDepth);
        appendQuad(a, b, c, d);

        // Close the front of each tread to make a proper concrete stair riser.
        const riserBottomY = y - (row === 0 ? 0.18 : 0.46);
        appendQuad(
          point(-halfWidth, -halfDepth, riserBottomY),
          point(halfWidth, -halfDepth, riserBottomY),
          b,
          a,
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
};

const makeAisleNosingGeometry = () => {
  const positions: number[] = [];
  const appendQuad = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
  ) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let section = 0; section < SECTIONS; section += 1) {
    const theta = (section / SECTIONS) * Math.PI * 2;
    const q = superEllipsePoint(theta, 40, 27, 4);
    const tx = -q.nz;
    const tz = q.nx;
    for (const tier of STADIUM_TIERS) {
      for (let row = 0; row < tier.rows; row += 1) {
        const offset = tier.baseOffset + row * 0.82;
        const y = tier.baseHeight + row * 0.46 + 0.055;
        const cx = q.x + q.nx * offset;
        const cz = q.z + q.nz * offset;
        const point = (side: number, depth: number): [number, number, number] => [
          cx + tx * side + q.nx * depth,
          y,
          cz + tz * side + q.nz * depth,
        ];
        appendQuad(
          point(-0.43, -0.41),
          point(0.43, -0.41),
          point(0.43, -0.34),
          point(-0.43, -0.34),
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
};

const makeAisleRailingGeometry = () => {
  const positions: number[] = [];
  const appendQuad = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    d: readonly [number, number, number],
  ) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  for (let section = 0; section < SECTIONS; section += 1) {
    const theta = (section / SECTIONS) * Math.PI * 2;
    const q = superEllipsePoint(theta, 40, 27, 4);
    const tx = -q.nz;
    const tz = q.nx;
    for (const tier of STADIUM_TIERS) {
      for (const side of [-0.5, 0.5]) {
        let previous: [number, number, number] | null = null;
        for (let row = 0; row < tier.rows; row += 1) {
          const offset = tier.baseOffset + row * 0.82;
          const baseY = tier.baseHeight + row * 0.46 + 0.06;
          const point: [number, number, number] = [
            q.x + q.nx * offset + tx * side,
            baseY + 0.72,
            q.z + q.nz * offset + tz * side,
          ];
          if (previous) {
            appendQuad(
              [previous[0], previous[1] - 0.035, previous[2]],
              [point[0], point[1] - 0.035, point[2]],
              [point[0], point[1] + 0.035, point[2]],
              [previous[0], previous[1] + 0.035, previous[2]],
            );
          }
          previous = point;

          if (row % 5 === 0 || row === tier.rows - 1) {
            const postHalfWidth = 0.035;
            appendQuad(
              [point[0] - tx * postHalfWidth, baseY, point[2] - tz * postHalfWidth],
              [point[0] + tx * postHalfWidth, baseY, point[2] + tz * postHalfWidth],
              [point[0] + tx * postHalfWidth, point[1], point[2] + tz * postHalfWidth],
              [point[0] - tx * postHalfWidth, point[1], point[2] - tz * postHalfWidth],
            );
          }
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
};

// 8 face groups (6 verts each), in the exact order writeSeatGeometry emits them:
// pan-top / pan-front-edge / pan-underside / seat-riser / backrest-front / backrest-rear / left-edge / right-edge
const DEFAULT_SEAT_GEOMETRY = {
  panFront: -0.15,
  panBack: 0.14,
  backTopZ: 0.284,
  panY: 0.11,
  backTopY: 0.330,
  faceBake: [1.00, 0.68, 0.36, 0.48, 0.90, 0.54, 0.68, 0.72],
} as const satisfies SeatGeometryValues;

const FACE_BAKE = DEFAULT_SEAT_GEOMETRY.faceBake;
const VERTEX_BAKE = [
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
] as const;

const displayColorForSeat = (
  section: number,
  row: number,
  state: StadiumSeatState,
) => {
  const zone = zoneColorForSeat(section, row) ?? SECTION_COLORS[0];
  if (state === "mine") {
    return zone.clone().lerp(COLORS.selectedTint, 0.28).multiplyScalar(1.08);
  }
  return state === "taken" ? zone.clone().multiplyScalar(0.62) : zone;
};

const setColor = (
  colors: Float32Array,
  index: number,
  state: StadiumSeatState,
  shade: number,
  faceBake: SeatGeometryValues["faceBake"] = FACE_BAKE,
) => {
  const section = Math.floor(index / (ROWS * COLS));
  const row     = Math.floor((index % (ROWS * COLS)) / COLS);
  const color   = displayColorForSeat(section, row, state);
  const start   = index * SEAT_VERTICES * 3;
  for (let vertex = 0; vertex < SEAT_VERTICES; vertex += 1) {
    const offset = start + vertex * 3;
    const bake = faceBake[Math.floor(vertex / 6)] * VERTEX_BAKE[vertex];
    colors[offset]     = Math.min(1, color.r * shade * bake);
    colors[offset + 1] = Math.min(1, color.g * shade * bake);
    colors[offset + 2] = Math.min(1, color.b * shade * bake);
  }
};

export const writeSeatGeometry = (
  positions: Float32Array,
  normals: Float32Array,
  index: number,
  layout: Pick<SeatLayout, "x" | "y" | "z" | "nx" | "nz" | "tx" | "tz">,
  lift: number,
  hw: number,
  lateral = 0,
  values: SeatGeometryValues = DEFAULT_SEAT_GEOMETRY,
) => {
  const x = layout.x + layout.tx * lateral;
  const y = layout.y + lift;
  const z = layout.z + layout.tz * lateral;
  const nx = layout.nx, nz = layout.nz, tx = layout.tx, tz = layout.tz;
  const s = hw / 0.135;
  let v = index * SEAT_VERTICES * 3;
  let n = index * SEAT_VERTICES * 3;
  const wr = (lx: number, ly: number, lz: number) => {
    positions[v]     = x + tx * lx + nx * lz;
    positions[v + 1] = y + ly;
    positions[v + 2] = z + tz * lx + nz * lz;
    v += 3;
  };
  const wn = (lnx: number, lny: number, lnz: number) => {
    const wx = tx * lnx + nx * lnz, wy = lny, wz = tz * lnx + nz * lnz;
    const len = Math.hypot(wx, wy, wz) || 1;
    normals[n]     = wx / len;
    normals[n + 1] = wy / len;
    normals[n + 2] = wz / len;
    n += 3;
  };

  const panFront = values.panFront * s;
  const panBack = values.panBack * s;
  const backTopZ = values.backTopZ * s;
  const panY = values.panY;
  const backTopY = values.backTopY;
  const frontHw = hw * 0.96;
  const backHw = hw * 0.95;
  const topHw = hw * 0.96;
  const frontY = panY + 0.006;
  const backY = panY;
  const undersideY = panY - 0.051;

  // Clean molded pan with only a slight rise at the front edge.
  wr(-frontHw, frontY, panFront); wn(0, 1, 0.03);
  wr( frontHw, frontY, panFront); wn(0, 1, 0.03);
  wr( backHw, backY, panBack);    wn(0, 1, 0.03);
  wr(-frontHw, frontY, panFront); wn(0, 1, 0.03);
  wr( backHw, backY, panBack);    wn(0, 1, 0.03);
  wr(-backHw, backY, panBack);    wn(0, 1, 0.03);

  // Thick rounded-looking front lip.
  wr(-frontHw, frontY, panFront);      wn(0, 0.25, 1);
  wr( frontHw, frontY, panFront);      wn(0, 0.25, 1);
  wr( frontHw, undersideY, panFront);  wn(0, 0.25, 1);
  wr(-frontHw, frontY, panFront);      wn(0, 0.25, 1);
  wr( frontHw, undersideY, panFront);  wn(0, 0.25, 1);
  wr(-frontHw, undersideY, panFront);  wn(0, 0.25, 1);

  wr(-frontHw, undersideY, panFront); wn(0, -1, 0);
  wr( frontHw, undersideY, panFront); wn(0, -1, 0);
  wr( backHw, undersideY, panBack);   wn(0, -1, 0);
  wr(-frontHw, undersideY, panFront); wn(0, -1, 0);
  wr( backHw, undersideY, panBack);   wn(0, -1, 0);
  wr(-backHw, undersideY, panBack);   wn(0, -1, 0);

  wr(-backHw, backY, panBack);       wn(0, 0.35, -1);
  wr( backHw, backY, panBack);       wn(0, 0.35, -1);
  wr( backHw, undersideY, panBack);  wn(0, 0.35, -1);
  wr(-backHw, backY, panBack);       wn(0, 0.35, -1);
  wr( backHw, undersideY, panBack);  wn(0, 0.35, -1);
  wr(-backHw, undersideY, panBack);  wn(0, 0.35, -1);

  // Broad molded backrest with a subtle shoulder taper.
  wr(-backHw, backY, panBack);       wn(0, 0.32, 0.95);
  wr( backHw, backY, panBack);       wn(0, 0.32, 0.95);
  wr( topHw, backTopY, backTopZ);    wn(0, 0.32, 0.95);
  wr(-backHw, backY, panBack);       wn(0, 0.32, 0.95);
  wr( topHw, backTopY, backTopZ);    wn(0, 0.32, 0.95);
  wr(-topHw, backTopY, backTopZ);    wn(0, 0.32, 0.95);

  // The rear shell tapers toward the crown. This gives the backrest thickness
  // in profile without a separate bright cap at the top.
  const rearBottomY = backY - 0.012;
  const rearBottomZ = panBack - 0.04;
  const rearTopY = backTopY - 0.004;
  const rearTopZ = backTopZ - 0.008;
  wr(-backHw, rearBottomY, rearBottomZ); wn(0, -0.32, -0.95);
  wr(-topHw, rearTopY, rearTopZ);        wn(0, -0.32, -0.95);
  wr( topHw, rearTopY, rearTopZ);        wn(0, -0.32, -0.95);
  wr(-backHw, rearBottomY, rearBottomZ); wn(0, -0.32, -0.95);
  wr( topHw, rearTopY, rearTopZ);        wn(0, -0.32, -0.95);
  wr( backHw, rearBottomY, rearBottomZ); wn(0, -0.32, -0.95);

  wr(-backHw, backY, panBack);           wn(-1, 0, 0);
  wr(-backHw, rearBottomY, rearBottomZ); wn(-1, 0, 0);
  wr(-topHw, rearTopY, rearTopZ);        wn(-1, 0, 0);
  wr(-backHw, backY, panBack);           wn(-1, 0, 0);
  wr(-topHw, rearTopY, rearTopZ);        wn(-1, 0, 0);
  wr(-topHw, backTopY, backTopZ);        wn(-1, 0, 0);

  wr(backHw, backY, panBack);           wn(1, 0, 0);
  wr(topHw, backTopY, backTopZ);        wn(1, 0, 0);
  wr(topHw, rearTopY, rearTopZ);        wn(1, 0, 0);
  wr(backHw, backY, panBack);           wn(1, 0, 0);
  wr(topHw, rearTopY, rearTopZ);        wn(1, 0, 0);
  wr(backHw, rearBottomY, rearBottomZ); wn(1, 0, 0);
};

export const makeStadiumSelectionScene =
  (controls: StadiumSelectionControls): WebGpuScene =>
  async ({ context, device, canvas }) => {
    const renderer = new THREE.WebGPURenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      context,
      device,
      antialias: true,
      samples: 4,
      alpha: false,
    });
    await renderer.init();
    const pixelRatio = Math.min(
      3,
      Math.max(1, canvas.width / Math.max(canvas.clientWidth, 1)),
    );
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setClearColor(COLORS.background, 1);

    const scene = new THREE.Scene();
    scene.background = COLORS.background.clone();
    scene.fog = new THREE.FogExp2(COLORS.background, 0.0038);

    const camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.3,
      980,
    );

    scene.add(new THREE.HemisphereLight(0xffffff, 0x222228, 1.8));
    const flood = new THREE.DirectionalLight(0xfffcf0, 1.8);
    flood.position.set(55, 120, 45);
    scene.add(flood);

    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(66, 44),
      new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: 0.9, metalness: 0.0 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    freezeObject(pitch);
    scene.add(pitch, makeGoal(-31.5), makeGoal(31.5));

    const bowlMat = new THREE.MeshStandardMaterial({ color: COLORS.concrete, roughness: 0.88, metalness: 0.0 });
    const lowerRows = 26;
    const upperRows = 19;
    const top1Off = (lowerRows - 1) * 0.82;
    const top1Y = 1.2 + (lowerRows - 1) * 0.46;
    const top2Off = 23 + (upperRows - 1) * 0.82;
    const top2Y = 16 + (upperRows - 1) * 0.46;
    const lowerProfile: [number, number][] = [
      [-0.7, 0],
      [-0.7, 1.2],
      ...makeTierSteps(lowerRows, 1.2, 0),
      [top1Off + 0.6, top1Y],
      [top1Off + 0.75, top1Y + 0.12],
    ];
    const upperProfile: [number, number][] = [
      [top1Off + 0.75, top1Y + 0.15],
      [23 - 0.7, top1Y + 0.15],
      [23 - 0.7, 16],
      ...makeTierSteps(upperRows, 16, 23),
      [top2Off + 0.6, top2Y],
      [top2Off + 0.8, top2Y + 0.9],
      [top2Off + 1.4, top2Y + 0.9],
      [top2Off + 1.4, 0],
    ];
    const bowlLower = new THREE.Mesh(makeSweptProfileGeometry(lowerProfile), bowlMat);
    const bowlUpper = new THREE.Mesh(makeSweptProfileGeometry(upperProfile), bowlMat);
    freezeObject(bowlLower);
    freezeObject(bowlUpper);
    scene.add(bowlLower, bowlUpper);

    const seatPatternTexture = makeSeatPatternTexture();
    const farSeatMaterial = new THREE.MeshBasicMaterial({
      map: seatPatternTexture,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    farSeatMaterial.toneMapped = false;
    const farSeats = new THREE.Mesh(makeFarSeatGeometry(), farSeatMaterial);
    farSeats.frustumCulled = false;
    farSeats.renderOrder = 1;
    scene.add(farSeats);

    const aisleSteps = new THREE.Mesh(
      makeAisleStepGeometry(),
      new THREE.MeshStandardMaterial({
        color: COLORS.concreteEdge,
        roughness: 0.82,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    const aisleRailings = new THREE.Mesh(
      makeAisleRailingGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0xd5d8d2,
        roughness: 0.38,
        metalness: 0.58,
        side: THREE.DoubleSide,
      }),
    );
    const aisleNosings = new THREE.Mesh(
      makeAisleNosingGeometry(),
      new THREE.MeshStandardMaterial({
        color: 0xd4bd58,
        roughness: 0.76,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    freezeObject(aisleSteps);
    freezeObject(aisleRailings);
    freezeObject(aisleNosings);
    scene.add(aisleSteps, aisleRailings, aisleNosings);

    const layouts: SeatLayout[] = [];
    const projectedSeats: ProjectedStadiumSeat[] = [];
    const positions = new Float32Array(SEAT_COUNT * SEAT_VERTICES * 3);
    const normals   = new Float32Array(SEAT_COUNT * SEAT_VERTICES * 3);
    const colors    = new Float32Array(SEAT_COUNT * SEAT_VERTICES * 3);
    const baseY     = new Float32Array(SEAT_COUNT);
    const shade     = new Float32Array(SEAT_COUNT);
    const hwPerSeat = new Float32Array(SEAT_COUNT);

    const _arcTable   = new Float32Array(ARC_STEPS + 1);
    const _thetaTable = new Float32Array(ARC_STEPS + 1);

    for (let section = 0; section < SECTIONS; section += 1) {
      const sectionStart = (section / SECTIONS) * Math.PI * 2;
      const sectionSpan = (Math.PI * 2) / SECTIONS;
      for (let row = 0; row < ROWS; row += 1) {
        const isUpper = row >= 26;
        const tierRow = isUpper ? row - 26 : row;
        const off = isUpper ? 23 + tierRow * 0.82 : tierRow * 0.82;
        const y   = isUpper ? 16.0 + tierRow * 0.46 : 1.2 + tierRow * 0.46;

        // Build arc-length table for this row's radial offset so columns are
        // placed at equal physical intervals regardless of superellipse curvature.
        const thetaStart = sectionStart + sectionSpan * 0.08;
        const thetaEnd   = sectionStart + sectionSpan * (0.08 + 0.84);
        {
          let prevQa = superEllipsePoint(thetaStart, 40, 27, 4);
          let prevXa = prevQa.x + prevQa.nx * off;
          let prevZa = prevQa.z + prevQa.nz * off;
          _arcTable[0]   = 0;
          _thetaTable[0] = thetaStart;
          for (let i = 1; i <= ARC_STEPS; i++) {
            const th  = thetaStart + (i / ARC_STEPS) * (thetaEnd - thetaStart);
            const qa  = superEllipsePoint(th, 40, 27, 4);
            const cx  = qa.x + qa.nx * off;
            const cz  = qa.z + qa.nz * off;
            _arcTable[i]   = _arcTable[i - 1] + Math.hypot(cx - prevXa, cz - prevZa);
            _thetaTable[i] = th;
            prevXa = cx;
            prevZa = cz;
          }
        }
        const totalArc = _arcTable[ARC_STEPS];
        const rowHw = totalArc / COLS * 0.4; // uniform half-width: 80% fill factor

        const activeCols = SECTION_ACTIVE_COLS[section];
        const colSkip = Math.floor((COLS - activeCols) / 2);
        let arcIdx = 0;
        for (let col = 0; col < COLS; col += 1) {
          const index = section * ROWS * COLS + row * COLS + col;
          const activeCol = col - colSkip;
          const isDead = activeCol < 0 || activeCol >= activeCols;

          if (isDead) {
            const deadProjected: ProjectedStadiumSeat = {
              index, x: 0, y: -2, worldX: 0, worldY: -9999, worldZ: 0,
              normalX: 0, normalZ: 0, radiusX: 0, radiusY: 0,
              depth: 1, visible: false, state: "taken",
            };
            const deadLayout: SeatLayout = { x: 0, y: -9999, z: 0, nx: 1, nz: 0, tx: 0, tz: 1, projected: deadProjected };
            layouts.push(deadLayout);
            projectedSeats.push(deadProjected);
            baseY[index] = -9999;
            shade[index] = 1;
            hwPerSeat[index] = 0;
            writeSeatGeometry(positions, normals, index, deadLayout, 0, 0);
            setColor(colors, index, "taken", 1);
            continue;
          }

          const targetArc = ((activeCol + 0.5) / activeCols) * totalArc;
          while (arcIdx < ARC_STEPS && _arcTable[arcIdx + 1] < targetArc) arcIdx++;
          const span  = _arcTable[arcIdx + 1] - _arcTable[arcIdx];
          const frac  = span > 0 ? (targetArc - _arcTable[arcIdx]) / span : 0;
          const theta = _thetaTable[arcIdx] + frac * (_thetaTable[arcIdx + 1] - _thetaTable[arcIdx]);

          const q = superEllipsePoint(theta, 40, 27, 4);
          const jitter = (seededNoise(section, row, col) - 0.5) * 0.02;
          const x = q.x + q.nx * (off + jitter);
          const z = q.z + q.nz * (off + jitter);
          const tx = -q.nz;
          const tz = q.nx;
          const projected = {
            index,
            x: 0,
            y: 0,
            worldX: x,
            worldY: y,
            worldZ: z,
            normalX: q.nx,
            normalZ: q.nz,
            radiusX: 0,
            radiusY: 0,
            depth: 1,
            visible: false,
            state: controls.seatsRef.current[index]?.state ?? "free",
          };
          const layout = { x, y, z, nx: q.nx, nz: q.nz, tx, tz, projected };
          layouts.push(layout);
          projectedSeats.push(projected);
          baseY[index] = y;
          shade[index] = 0.96 + seededNoise(row, col, section) * 0.04;
          hwPerSeat[index] = rowHw;
          writeSeatGeometry(positions, normals, index, layout, 0, rowHw);
          setColor(colors, index, controls.seatsRef.current[index].state, shade[index]);
        }
      }
    }

    const seatGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const normalAttribute  = new THREE.BufferAttribute(normals, 3);
    const colorAttribute   = new THREE.BufferAttribute(colors, 3);
    seatGeometry.setAttribute("position", positionAttribute);
    seatGeometry.setAttribute("normal",   normalAttribute);
    seatGeometry.setAttribute("color",    colorAttribute);
    const seatMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    seatMaterial.toneMapped = false;
    const seatCloud = new THREE.Mesh(seatGeometry, seatMaterial);
    seatCloud.frustumCulled = false;
    seatCloud.renderOrder = 2;
    scene.add(seatCloud);

    const vpMatrix = new THREE.Matrix4();
    controls.projectedSeatsRef.current = projectedSeats;

    const selectedHighlightPositions = new Float32Array(SELECTED_HIGHLIGHT_COUNT * 3);
    const selectedHighlightGeometry = new THREE.BufferGeometry();
    const selectedHighlightAttribute = new THREE.BufferAttribute(selectedHighlightPositions, 3);
    selectedHighlightGeometry.setAttribute("position", selectedHighlightAttribute);
    selectedHighlightGeometry.setDrawRange(0, 0);
    const selectedHighlight = new THREE.Points(
      selectedHighlightGeometry,
      new THREE.PointsMaterial({
        color: COLORS.selectedTint,
        size: 2.15,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    selectedHighlight.frustumCulled = false;
    selectedHighlight.visible = false;
    scene.add(selectedHighlight);

    let previousTime = performance.now() * 0.001;
    const selectedLift = new Float32Array(SEAT_COUNT);
    const selectedVelocity = new Float32Array(SEAT_COUNT);
    const renderedState = controls.seatsRef.current.map((seat) => seat.state);
    const selectedSeatIndices = new Set<number>();
    for (let index = 0; index < renderedState.length; index += 1) {
      if (renderedState[index] === "mine") {
        selectedSeatIndices.add(index);
      }
    }
    const activeSeatIndices = new Set<number>();
    let lastTheta = Infinity;
    let lastPhi = Infinity;
    let lastRadius = Infinity;
    let lastRingAngle = Infinity;
    let lastRowHeight = Infinity;
    let lastDetailBlend = -1;
    const smoothedOrbit = {
      theta:     controls.orbitRef.current.theta,
      phi:       controls.orbitRef.current.phi,
      radius:    controls.orbitRef.current.radius,
      targetX:   controls.orbitRef.current.targetX,
      targetY:   controls.orbitRef.current.targetY,
      targetZ:   controls.orbitRef.current.targetZ,
      ringAngle: controls.orbitRef.current.ringAngle,
      rowHeight: controls.orbitRef.current.rowHeight,
    };

    const render = (timestamp: number) => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      const aspect = width / height;
      if (Math.abs(camera.aspect - aspect) > 0.001) {
        camera.aspect = aspect;
        const vFovRad = 2 * Math.atan(Math.tan(H_FOV_RAD / 2) / aspect);
        camera.fov = Math.max(45, Math.min(100, vFovRad * (180 / Math.PI)));
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      }

      const time = timestamp * 0.001;
      const dt = Math.min(Math.max(time - previousTime, 1 / 120), 0.05);
      previousTime = time;
      const orbit = controls.orbitRef.current;

      // Smooth one continuous orbit. Pinches track quickly; tap fly-ins stay cinematic.
      const alpha = 1 - Math.exp(-12 * dt);
      const radiusAlpha = 1 - Math.exp(
        -(controls.isPinchingRef.current ? 20 : 6) * dt,
      );
      const wrapLerp = (cur: number, target: number) => {
        const d = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        return cur + d * alpha;
      };
      smoothedOrbit.theta     = wrapLerp(smoothedOrbit.theta,     orbit.theta);
      smoothedOrbit.ringAngle = wrapLerp(smoothedOrbit.ringAngle, orbit.ringAngle);
      smoothedOrbit.phi       += (orbit.phi       - smoothedOrbit.phi)       * alpha;
      smoothedOrbit.radius    += (orbit.radius    - smoothedOrbit.radius)    * radiusAlpha;
      smoothedOrbit.targetX   += (orbit.targetX   - smoothedOrbit.targetX)   * alpha;
      smoothedOrbit.targetY   += (orbit.targetY   - smoothedOrbit.targetY)   * alpha;
      smoothedOrbit.targetZ   += (orbit.targetZ   - smoothedOrbit.targetZ)   * alpha;
      smoothedOrbit.rowHeight += (orbit.rowHeight - smoothedOrbit.rowHeight) * alpha;

      const phi    = clamp(smoothedOrbit.phi, 0.12, 1.42);
      const radius = clamp(smoothedOrbit.radius, 6.4, 255);
      const verticalFov = camera.fov * (Math.PI / 180);
      const projectedSeatPixels =
        (0.24 * height) / (2 * Math.tan(verticalFov / 2) * radius);
      const lodProgress = clamp(
        (projectedSeatPixels - FAR_LOD_SEAT_PIXELS) /
          (DETAIL_LOD_SEAT_PIXELS - FAR_LOD_SEAT_PIXELS),
        0,
        1,
      );
      const detailBlend =
        lodProgress * lodProgress * (3 - 2 * lodProgress);
      const lodDirty = Math.abs(detailBlend - lastDetailBlend) > 0.002;
      if (lodDirty) {
        lastDetailBlend = detailBlend;
        seatMaterial.opacity = detailBlend;
        farSeatMaterial.opacity = 1 - detailBlend;
        seatCloud.visible = detailBlend > 0.005;
        farSeats.visible = detailBlend < 0.995;
      }

      const sinPhi = Math.sin(phi);
      CAMERA_TARGET.set(
        smoothedOrbit.targetX,
        smoothedOrbit.targetY,
        smoothedOrbit.targetZ,
      );
      camera.position.set(
        smoothedOrbit.targetX + radius * sinPhi * Math.sin(smoothedOrbit.theta),
        smoothedOrbit.targetY + radius * Math.cos(phi),
        smoothedOrbit.targetZ + radius * sinPhi * Math.cos(smoothedOrbit.theta),
      );
      camera.lookAt(CAMERA_TARGET);
      camera.updateMatrixWorld();
      vpMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const cameraSnapshot = controls.cameraSnapshotRef.current;
      cameraSnapshot.viewProjection.set(vpMatrix.elements);
      cameraSnapshot.x = camera.position.x;
      cameraSnapshot.y = camera.position.y;
      cameraSnapshot.z = camera.position.z;
      cameraSnapshot.ready = true;

      const orbitSettled =
        Math.abs(smoothedOrbit.theta     - orbit.theta)     < 0.001 &&
        Math.abs(smoothedOrbit.phi       - orbit.phi)       < 0.001 &&
        Math.abs(smoothedOrbit.radius    - orbit.radius)    < 0.5   &&
        Math.abs(smoothedOrbit.targetX   - orbit.targetX)   < 0.05  &&
        Math.abs(smoothedOrbit.targetY   - orbit.targetY)   < 0.05  &&
        Math.abs(smoothedOrbit.targetZ   - orbit.targetZ)   < 0.05  &&
        Math.abs(smoothedOrbit.ringAngle - orbit.ringAngle) < 0.001 &&
        Math.abs(smoothedOrbit.rowHeight - orbit.rowHeight) < 0.001;
      const cameraDirty =
        Math.abs(orbit.theta     - lastTheta)     > 0.0001 ||
        Math.abs(orbit.phi       - lastPhi)       > 0.0001 ||
        Math.abs(orbit.radius    - lastRadius)    > 0.0001 ||
        Math.abs(orbit.ringAngle - lastRingAngle) > 0.0001 ||
        Math.abs(orbit.rowHeight - lastRowHeight) > 0.0001 ||
        !orbitSettled;
      if (cameraDirty) {
        lastTheta     = orbit.theta;
        lastPhi       = orbit.phi;
        lastRadius    = orbit.radius;
        lastRingAngle = orbit.ringAngle;
        lastRowHeight = orbit.rowHeight;
      }

      let positionDirty = false;
      let colorDirty = false;
      let selectedHighlightDirty = false;
      const seats = controls.seatsRef.current;
      const dirtySeatIndices = controls.dirtySeatIndicesRef.current;
      for (const index of dirtySeatIndices) {
        activeSeatIndices.add(index);
      }
      dirtySeatIndices.clear();

      for (const index of activeSeatIndices) {
        const seat = seats[index];
        const targetLift = seat.state === "mine" ? 0.14 : 0;
        const stateChanged = seat.state !== renderedState[index];
        const shakeActive = seat.shake > 0;
        if (stateChanged) {
          renderedState[index] = seat.state;
          selectedVelocity[index] = seat.state === "mine" ? -0.18 : 0;
          setColor(colors, index, seat.state, shade[index]);
          if (seat.state === "mine") {
            selectedSeatIndices.add(index);
          } else {
            selectedSeatIndices.delete(index);
          }
          colorDirty = true;
          selectedHighlightDirty = true;
        }
        if (
          stateChanged ||
          Math.abs(selectedLift[index] - targetLift) > 0.002 ||
          Math.abs(selectedVelocity[index]) > 0.002 ||
          shakeActive
        ) {
          selectedVelocity[index] +=
            (170 * (targetLift - selectedLift[index]) - 11 * selectedVelocity[index]) * dt;
          selectedLift[index] += selectedVelocity[index] * dt;
          if (
            Math.abs(selectedLift[index] - targetLift) < 0.002 &&
            Math.abs(selectedVelocity[index]) < 0.01
          ) {
            selectedLift[index] = targetLift;
            selectedVelocity[index] = 0;
          }
          let shakeOffset = 0;
          if (shakeActive) {
            const nextShake = Math.max(0, seat.shake - dt * 3);
            if (nextShake > 0.02) {
              const shakeProgress = 1 - seat.shake;
              shakeOffset =
                Math.sin(shakeProgress * Math.PI * 5) * 0.045 * seat.shake;
              seat.shake = nextShake;
            } else {
              seat.shake = 0;
            }
          }
          writeSeatGeometry(
            positions,
            normals,
            index,
            layouts[index],
            selectedLift[index],
            hwPerSeat[index],
            shakeOffset,
          );
          positionDirty = true;
          if (seat.state === "mine") {
            selectedHighlightDirty = true;
          }
          if (
            selectedLift[index] === targetLift &&
            selectedVelocity[index] === 0 &&
            seat.shake === 0 &&
            !stateChanged
          ) {
            activeSeatIndices.delete(index);
          }
        }
      }

      if (selectedHighlightDirty || cameraDirty) {
        let highlightIndex = 0;
        for (const index of selectedSeatIndices) {
          if (highlightIndex >= SELECTED_HIGHLIGHT_COUNT) break;
          const layout = layouts[index];
          const offset = highlightIndex * 3;
          selectedHighlightPositions[offset] = layout.x;
          selectedHighlightPositions[offset + 1] = baseY[index] + selectedLift[index] + 0.72;
          selectedHighlightPositions[offset + 2] = layout.z;
          highlightIndex += 1;
        }
        selectedHighlightGeometry.setDrawRange(0, highlightIndex);
        selectedHighlight.visible = false;
        selectedHighlightAttribute.needsUpdate = true;
      }

      if (positionDirty) { positionAttribute.needsUpdate = true; normalAttribute.needsUpdate = true; }
      if (colorDirty) colorAttribute.needsUpdate = true;
      const didRender =
        cameraDirty ||
        positionDirty ||
        colorDirty ||
        selectedHighlightDirty ||
        lodDirty;
      if (didRender) renderer.render(scene, camera);
      return didRender;
    };

    const initialOrbit = controls.orbitRef.current;
    const initialPhi = clamp(initialOrbit.phi, 0.12, 1.42);
    const initialSinPhi = Math.sin(initialPhi);
    CAMERA_TARGET.set(
      initialOrbit.targetX,
      initialOrbit.targetY,
      initialOrbit.targetZ,
    );
    camera.position.set(
      initialOrbit.targetX +
        initialOrbit.radius * initialSinPhi * Math.sin(initialOrbit.theta),
      initialOrbit.targetY + initialOrbit.radius * Math.cos(initialPhi),
      initialOrbit.targetZ +
        initialOrbit.radius * initialSinPhi * Math.cos(initialOrbit.theta),
    );
    camera.lookAt(CAMERA_TARGET);
    camera.updateMatrixWorld();

    renderer.initTexture(seatPatternTexture);
    await renderer.compileAsync(scene, camera);
    seatCloud.visible = true;
    farSeats.visible = true;
    seatMaterial.opacity = 0.001;
    farSeatMaterial.opacity = 0.001;
    renderer.render(scene, camera);
    await device.queue.onSubmittedWorkDone();
    seatCloud.visible = false;
    farSeats.visible = true;
    seatMaterial.opacity = 0;
    farSeatMaterial.opacity = 1;

    return render;
  };

export const STADIUM_SEAT_COUNT = SEAT_COUNT;
export const STADIUM_SEAT_PRICE = PRICE;
