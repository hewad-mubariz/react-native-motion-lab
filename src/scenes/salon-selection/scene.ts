import type { Scene as WebGpuScene } from "@/hooks/useWebGPU";
import type { RefObject } from "react";
import * as THREE from "three/webgpu";
import {
  Fn,
  color,
  cos,
  float,
  length,
  mix as tslMix,
  sin,
  smoothstep,
  time,
  uv,
  vec2,
} from "three/tsl";

export type SalonSeatState = "free" | "taken" | "mine";
export type SalonViewMode = "overview" | "pov";

export type SalonSeat = {
  row: number;
  col: number;
  label: string;
  state: SalonSeatState;
  shake: number;
};

export type ProjectedSalonSeat = {
  index: number;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  depth: number;
  state: SalonSeatState;
};

export type SalonOrbit = {
  theta: number;
  phi: number;
  radius: number;
  povYaw: number;
  povPitch: number;
};

export type SalonSelectionControls = {
  seatsRef: RefObject<SalonSeat[]>;
  orbitRef: RefObject<SalonOrbit>;
  modeRef: RefObject<SalonViewMode>;
  povSeatIndexRef: RefObject<number | null>;
  projectedSeatsRef: RefObject<ProjectedSalonSeat[]>;
};

type RuntimeSeat = {
  base: THREE.Vector3;
  quaternion: THREE.Quaternion;
  visual: SeatVisual | null;
  lift: number;
  liftVelocity: number;
  spread: number;
  spreadVelocity: number;
  scale: number;
  phase: number;
  renderedState: SalonSeatState;
  projected: ProjectedSalonSeat;
};

type SelectionTuning = {
  k: number;
  damp: number;
  lift: number;
  scale: number;
  kick: number;
};

type PulseRing = {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  seatIndex: number;
  age: number;
  color: THREE.Color;
};

type SeatVisual = {
  group: THREE.Group;
  cushion: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  back: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  contact: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  seatIndex: number;
};

type GeometryBatch = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  geometry: THREE.BufferGeometry;
  sourcePositions: Float32Array;
  sourceNormals: Float32Array | null;
  positionAttribute: THREE.BufferAttribute;
  normalAttribute: THREE.BufferAttribute | null;
  verticesPerItem: number;
};

const ROWS = 8;
const COLS = 12;
const SEAT_COUNT = ROWS * COLS;
const PITCH_X = 1.16;
const STEP_H = 0.42;
const STEP_D = 1.82;
const STEP_W = 16.4;
const FLOOR_W = 20.4;
const FLOOR_D = 21.6;
const ROW_CURVE_DEPTH = 0.18;
const SCREEN_Z = -13.4;
const PULSE_DURATION = 0.55;

const COLORS = {
  background: new THREE.Color(0x626354),
  floor: new THREE.Color(0x545448),
  step: new THREE.Color(0x3f4238),
  free: new THREE.Color(0x86d7d2),
  freeEmiss: new THREE.Color(0x1a5955),
  taken: new THREE.Color(0xe98773),
  takenEmiss: new THREE.Color(0xb94534),
  mine: new THREE.Color(0xe5b45b),
  mineEmiss: new THREE.Color(0xe5b45b),
  frame: new THREE.Color(0x22231f),
} as const;

const STATE_KEYS: readonly SalonSeatState[] = ["free", "taken", "mine"];

const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const TEMP_MATRIX = new THREE.Matrix4();
const TEMP_NORMAL_MATRIX = new THREE.Matrix3();
const SEAT_MATRIX = new THREE.Matrix4();
const TEMP_OBJECT = new THREE.Object3D();
const TEMP_POSITION = new THREE.Vector3();
const TEMP_SCALE = new THREE.Vector3();
const TEMP_VERTEX = new THREE.Vector3();
const TEMP_NORMAL = new THREE.Vector3();

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const integrateSpring = (
  value: number,
  velocity: number,
  target: number,
  dt: number,
  tuning: SelectionTuning,
) => {
  const nextVelocity =
    velocity + (tuning.k * (target - value) - tuning.damp * velocity) * dt;
  return {
    value: value + nextVelocity * dt,
    velocity: nextVelocity,
  };
};

const freezeObject = (object: THREE.Object3D) => {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
};

const mulberry32 = (seed: number) => {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeNoiseTexture = (
  seed: number,
  spread: number,
  repeatX: number,
  repeatY: number,
) => {
  const size = 128;
  const random = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);

  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(128 + (random() - 0.5) * spread);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
};

const makeFabricBump = () => makeNoiseTexture(1337, 28, 1.35, 1.35);

const makeCarpetBump = () => makeNoiseTexture(7331, 42, 7, 1.25);

const makeWallBackdropTexture = () => {
  const width = 96;
  const height = 160;
  const random = mulberry32(9821);
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const vertical = y / Math.max(height - 1, 1);
      const paper = (random() - 0.5) * 8;
      const brush = Math.sin(x * 0.18 + y * 0.035) * 3.5;
      const linen = Math.sin(y * 0.52) * 1.8;
      const vignette = -Math.abs(vertical - 0.42) * 10;
      const shade = paper + brush + linen + vignette;
      const offset = (y * width + x) * 4;
      data[offset] = clamp(Math.round(112 + shade), 0, 255);
      data[offset + 1] = clamp(Math.round(114 + shade), 0, 255);
      data[offset + 2] = clamp(Math.round(99 + shade), 0, 255);
      data[offset + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

const makeRadialShadowTexture = () => {
  const size = 128;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x / (size - 1) - 0.5;
      const dy = y / (size - 1) - 0.5;
      const d = Math.hypot(dx, dy) / 0.5;
      const inner = d < 0.6 ? 0.85 + (0.35 - 0.85) * (d / 0.6) : 0;
      const outer = d >= 0.6 && d < 1 ? 0.35 * (1 - (d - 0.6) / 0.4) : 0;
      const alpha = d < 0.6 ? inner : outer;
      const offset = (y * size + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = Math.round(clamp(alpha, 0, 1) * 255);
    }
  }

  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
};

const roundedBoxGeo = (
  width: number,
  height: number,
  depth: number,
  radius: number,
) => {
  const r = Math.min(
    radius,
    width / 2 - 0.001,
    height / 2 - 0.001,
    depth / 2 - 0.001,
  );
  const shape = new THREE.Shape();
  const x = width / 2 - r;
  const y = height / 2 - r;

  shape.moveTo(-x, -height / 2);
  shape.lineTo(x, -height / 2);
  shape.absarc(x, -y, r, -Math.PI / 2, 0);
  shape.lineTo(width / 2, y);
  shape.absarc(x, y, r, 0, Math.PI / 2);
  shape.lineTo(-x, height / 2);
  shape.absarc(-x, y, r, Math.PI / 2, Math.PI);
  shape.lineTo(-width / 2, -y);
  shape.absarc(-x, -y, r, Math.PI, Math.PI * 1.5);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - r * 2,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: 6,
  });
  geometry.center();
  return geometry;
};

const makeLocalMatrix = (
  x: number,
  y: number,
  z: number,
  rx = 0,
) => {
  TEMP_OBJECT.position.set(x, y, z);
  TEMP_OBJECT.rotation.set(rx, 0, 0);
  TEMP_OBJECT.scale.set(1, 1, 1);
  TEMP_OBJECT.updateMatrix();
  return TEMP_OBJECT.matrix.clone();
};

const makeGeometryBatch = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
) => {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const sourcePosition = source.getAttribute("position") as THREE.BufferAttribute;
  const sourceNormal = source.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const sourceUv = source.getAttribute("uv") as THREE.BufferAttribute | undefined;
  const verticesPerItem = sourcePosition.count;
  const batchGeometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    new Float32Array(verticesPerItem * count * 3),
    3,
  );
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  batchGeometry.setAttribute("position", positionAttribute);

  let normalAttribute: THREE.BufferAttribute | null = null;
  if (sourceNormal) {
    normalAttribute = new THREE.BufferAttribute(
      new Float32Array(verticesPerItem * count * 3),
      3,
    );
    normalAttribute.setUsage(THREE.DynamicDrawUsage);
    batchGeometry.setAttribute("normal", normalAttribute);
  }

  if (sourceUv) {
    const uvArray = new Float32Array(verticesPerItem * count * 2);
    for (let item = 0; item < count; item += 1) {
      uvArray.set(sourceUv.array as Float32Array, item * verticesPerItem * 2);
    }
    batchGeometry.setAttribute("uv", new THREE.BufferAttribute(uvArray, 2));
  }

  batchGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, -1), 35);

  const mesh = new THREE.Mesh(batchGeometry, material);
  mesh.frustumCulled = false;
  freezeObject(mesh);
  return {
    mesh,
    geometry: batchGeometry,
    sourcePositions: sourcePosition.array as Float32Array,
    sourceNormals: sourceNormal ? (sourceNormal.array as Float32Array) : null,
    positionAttribute,
    normalAttribute,
    verticesPerItem,
  };
};

const writeBatchMatrix = (
  batch: GeometryBatch,
  index: number,
  matrix: THREE.Matrix4,
) => {
  const positionArray = batch.positionAttribute.array as Float32Array;
  const normalArray = batch.normalAttribute?.array as Float32Array | undefined;
  const positionStart = index * batch.verticesPerItem * 3;
  TEMP_NORMAL_MATRIX.getNormalMatrix(matrix);

  for (let vertex = 0; vertex < batch.verticesPerItem; vertex += 1) {
    const sourceOffset = vertex * 3;
    const targetOffset = positionStart + sourceOffset;
    TEMP_VERTEX.fromArray(batch.sourcePositions, sourceOffset).applyMatrix4(matrix);
    TEMP_VERTEX.toArray(positionArray, targetOffset);

    if (normalArray && batch.sourceNormals) {
      TEMP_NORMAL.fromArray(batch.sourceNormals, sourceOffset)
        .applyMatrix3(TEMP_NORMAL_MATRIX)
        .normalize();
      TEMP_NORMAL.toArray(normalArray, targetOffset);
    }
  }

  batch.positionAttribute.addUpdateRange(positionStart, batch.verticesPerItem * 3);
  batch.positionAttribute.needsUpdate = true;

  if (batch.normalAttribute) {
    batch.normalAttribute.addUpdateRange(positionStart, batch.verticesPerItem * 3);
    batch.normalAttribute.needsUpdate = true;
  }
};

const makeSeatPart = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  localMatrix: THREE.Matrix4,
) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrix.copy(localMatrix);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
};

const makeScreenColorNode = () =>
  Fn(() => {
    const st = uv();
    const p = st.sub(vec2(0.5, 0.5));
    const t = time.mul(0.25);
    const wave = sin(st.x.mul(5).add(t))
      .mul(cos(st.y.mul(4).sub(t.mul(0.85))))
      .mul(0.5)
      .add(0.5);
    const radial = length(p);
    const pulse = sin(radial.mul(18).sub(t.mul(6))).mul(0.5).add(0.5);
    const goldGate = smoothstep(0.55, 1, pulse).mul(smoothstep(0.9, 0.05, radial));
    const vignette = float(1)
      .add(smoothstep(0.26, 0, radial).mul(0.25))
      .sub(smoothstep(0.32, 0.74, radial).mul(0.45));
    const base = tslMix(color(0x0d3373), color(0x8c59bf), wave);

    return tslMix(base, color(0xf2bf59), goldGate.mul(0.42)).mul(vignette);
  })();

export const makeSalonSelectionScene =
  (controls: SalonSelectionControls): WebGpuScene =>
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
    const selectionTuning: SelectionTuning =
      Math.min(canvas.clientWidth, canvas.clientHeight) < 700
        ? { k: 175, damp: 10, lift: 0.56, scale: 1.11, kick: -1.6 }
        : { k: 130, damp: 11, lift: 0.42, scale: 1.06, kick: -1.1 };

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.setClearColor(COLORS.background, 1);

    const scene = new THREE.Scene();
    scene.background = makeWallBackdropTexture();
    scene.fog = new THREE.FogExp2(COLORS.background, 0.006);

    const camera = new THREE.PerspectiveCamera(
      52,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.1,
      200,
    );

    scene.add(new THREE.AmbientLight(0xffffff, 1.35));

    const screenLight = new THREE.PointLight(0x9fd8ff, 0.25, 40, 1.8);
    screenLight.position.set(0, 4.2, -13);
    scene.add(screenLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d0, 1.25);
    keyLight.position.set(6, 16, 6);
    scene.add(keyLight);

    const hall = new THREE.Group();
    scene.add(hall);

    const fabricBump = makeFabricBump();
    const carpetBump = makeCarpetBump();
    const makeFabricMaterial = (
      color: THREE.Color,
      emissive: THREE.Color,
      emissiveIntensity: number,
    ) =>
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity,
        roughness: 0.92,
        metalness: 0,
        bumpMap: fabricBump,
        bumpScale: 0.004,
      });
    const fabricMaterials: Record<SalonSeatState, THREE.MeshStandardMaterial> = {
      free: makeFabricMaterial(COLORS.free, COLORS.freeEmiss, 0.04),
      taken: makeFabricMaterial(COLORS.taken, COLORS.takenEmiss, 0.1),
      mine: makeFabricMaterial(COLORS.mine, COLORS.mineEmiss, 0.18),
    };
    const frameMat = new THREE.MeshStandardMaterial({
      color: COLORS.frame,
      roughness: 0.45,
      metalness: 0.55,
    });
    const stepMat = new THREE.MeshStandardMaterial({
      color: COLORS.step,
      roughness: 0.95,
        metalness: 0,
        bumpMap: carpetBump,
        bumpScale: 0.012,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      roughness: 0.78,
      metalness: 0.05,
    });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_W, 0.5, FLOOR_D), floorMat);
    floor.position.set(0, -0.25, 0.75);
    freezeObject(floor);
    hall.add(floor);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(FLOOR_W + 0.3, 0.06, FLOOR_D + 0.3),
      new THREE.MeshBasicMaterial({
        color: 0xe5b45b,
        transparent: true,
        opacity: 0.35,
      }),
    );
    rim.position.set(0, -0.52, 0.75);
    freezeObject(rim);
    hall.add(rim);

    const tv = new THREE.Group();
    tv.position.set(0, 3.6, -13.55);
    hall.add(tv);

    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0x14110e,
      roughness: 0.55,
      metalness: 0.35,
    });
    const bezelDarkMat = new THREE.MeshStandardMaterial({
      color: 0x080706,
      roughness: 0.85,
      metalness: 0.1,
    });
    const bezelFront = new THREE.Mesh(roundedBoxGeo(13.4, 6.35, 0.18, 0.14), bezelMat);
    bezelFront.position.z = 0.09;
    freezeObject(bezelFront);
    tv.add(bezelFront);

    const bezelBack = new THREE.Mesh(new THREE.BoxGeometry(13.0, 5.95, 0.55), bezelDarkMat);
    bezelBack.position.z = -0.28;
    freezeObject(bezelBack);
    tv.add(bezelBack);

    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffb060 }),
    );
    led.position.set(0, -2.98, 0.19);
    freezeObject(led);
    tv.add(led);

    const screenMaterial = new THREE.MeshBasicNodeMaterial();
    screenMaterial.colorNode = makeScreenColorNode();
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 5.4), screenMaterial);
    screen.position.set(0, 3.6, -13.45);
    freezeObject(screen);
    hall.add(screen);

    const reflectionMaterial = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    reflectionMaterial.colorNode = makeScreenColorNode().mul(color(0x5a7fa3));
    const reflection = new THREE.Mesh(
      new THREE.PlaneGeometry(12.5, 6.5),
      reflectionMaterial,
    );
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(0, 0.016, -13.4 + 6.5 / 2);
    freezeObject(reflection);
    hall.add(reflection);

    const cushionGeo = roundedBoxGeo(0.68, 0.17, 0.58, 0.06);
    const backGeo = roundedBoxGeo(0.68, 0.78, 0.15, 0.07);
    const armGeo = roundedBoxGeo(0.09, 0.09, 0.55, 0.035);
    const armPostGeo = new THREE.BoxGeometry(0.07, 0.22, 0.07);
    const pedestalGeo = new THREE.BoxGeometry(0.42, 0.2, 0.4);
    const contactGeo = new THREE.PlaneGeometry(1.05, 1.0);
    const ringGeo = new THREE.RingGeometry(0.42, 0.5, 48);
    const contactMaterial = new THREE.MeshBasicMaterial({
      map: makeRadialShadowTexture(),
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });

    const cushionBatches = Object.fromEntries(
      STATE_KEYS.map((state) => [
        state,
        makeGeometryBatch(cushionGeo, fabricMaterials[state], SEAT_COUNT),
      ]),
    ) as Record<SalonSeatState, GeometryBatch>;
    const backBatches = Object.fromEntries(
      STATE_KEYS.map((state) => [
        state,
        makeGeometryBatch(backGeo, fabricMaterials[state], SEAT_COUNT),
      ]),
    ) as Record<SalonSeatState, GeometryBatch>;
    const pedestalBatch = makeGeometryBatch(pedestalGeo, frameMat, SEAT_COUNT);
    const armBatch = makeGeometryBatch(armGeo, frameMat, SEAT_COUNT * 2);
    const postBatch = makeGeometryBatch(armPostGeo, frameMat, SEAT_COUNT * 2);
    const contactBatch = makeGeometryBatch(
      contactGeo,
      contactMaterial,
      SEAT_COUNT,
    );

    hall.add(
      ...STATE_KEYS.map((state) => cushionBatches[state].mesh),
      ...STATE_KEYS.map((state) => backBatches[state].mesh),
      pedestalBatch.mesh,
      armBatch.mesh,
      postBatch.mesh,
      contactBatch.mesh,
    );

    const local = {
      cushion: makeLocalMatrix(0, 0.29, 0.06, -0.05),
      back: makeLocalMatrix(0, 0.62, -0.26, 0.14),
      pedestal: makeLocalMatrix(0, 0.1, 0),
      armLeft: makeLocalMatrix(-0.41, 0.42, -0.02),
      armRight: makeLocalMatrix(0.41, 0.42, -0.02),
      postLeft: makeLocalMatrix(-0.41, 0.26, 0.12),
      postRight: makeLocalMatrix(0.41, 0.26, 0.12),
    };

    const makeVisual = (): SeatVisual => {
      const group = new THREE.Group();
      const cushion = makeSeatPart(cushionGeo, fabricMaterials.free, local.cushion);
      const back = makeSeatPart(backGeo, fabricMaterials.free, local.back);
      const contact = new THREE.Mesh(
        contactGeo,
        contactMaterial,
      );
      contact.rotation.x = -Math.PI / 2;
      contact.matrixAutoUpdate = false;
      contact.frustumCulled = false;
      contact.visible = false;

      group.add(
        cushion,
        back,
        makeSeatPart(pedestalGeo, frameMat, local.pedestal),
        makeSeatPart(armGeo, frameMat, local.armLeft),
        makeSeatPart(armGeo, frameMat, local.armRight),
        makeSeatPart(armPostGeo, frameMat, local.postLeft),
        makeSeatPart(armPostGeo, frameMat, local.postRight),
      );
      group.visible = false;
      group.matrixAutoUpdate = false;
      group.frustumCulled = false;
      hall.add(group, contact);

      return {
        group,
        cushion,
        back,
        contact,
        seatIndex: -1,
      };
    };

    const visualPool = Array.from({ length: 18 }, makeVisual);
    let nextVisualIndex = 0;

    const ringPool: PulseRing[] = Array.from({ length: 8 }, () => {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe5b45b,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      freezeObject(mesh);
      hall.add(mesh);
      return {
        mesh,
        seatIndex: -1,
        age: PULSE_DURATION,
        color: new THREE.Color(0xe5b45b),
      };
    });
    let nextRingIndex = 0;

    const runtimeSeats: RuntimeSeat[] = [];
    const projectedSeats: ProjectedSalonSeat[] = [];

    for (let row = 0; row < ROWS; row += 1) {
      const rowZ = -6.2 + row * 1.55;
      const stepTop = 0.02 + row * STEP_H;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(STEP_W, stepTop + 0.02, STEP_D),
        stepMat,
      );
      step.position.set(0, (stepTop + 0.02) / 2 - 0.02, rowZ + 0.1);
      freezeObject(step);
      hall.add(step);

      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(STEP_W, 0.025, 0.03),
        new THREE.MeshBasicMaterial({ color: 0x6e7364 }),
      );
      strip.position.set(0, stepTop + 0.005, rowZ + 0.1 + STEP_D / 2 - 0.02);
      freezeObject(strip);
      hall.add(strip);

      for (let col = 0; col < COLS; col += 1) {
        const index = row * COLS + col;
        const seat = controls.seatsRef.current[index];
        const off = col - (COLS - 1) / 2;
        const x = off * PITCH_X;
        const curve = -Math.pow(x / ((COLS / 2) * PITCH_X), 2) * ROW_CURVE_DEPTH;
        const z = rowZ - curve;

        TEMP_OBJECT.position.set(x, stepTop, z);
        TEMP_OBJECT.lookAt(x * 0.4, stepTop, SCREEN_Z);
        const projected = {
          index,
          x: 0,
          y: 0,
          radiusX: 0.07,
          radiusY: 0.05,
          depth: 1,
          state: seat.state,
        };
        projectedSeats.push(projected);
        runtimeSeats.push({
          base: new THREE.Vector3(x, stepTop, z),
          quaternion: TEMP_OBJECT.quaternion.clone(),
          visual: null,
          lift: 0,
          liftVelocity: 0,
          spread: 0,
          spreadVelocity: 0,
          scale: 1,
          phase: (index * 1.618) % (Math.PI * 2),
          renderedState: seat.state,
          projected,
        });
      }
    }

    const writeSeatGeometry = (
      index: number,
      runtime: RuntimeSeat,
      state: SalonSeatState,
    ) => {
      TEMP_POSITION.set(
        runtime.base.x + runtime.spread,
        runtime.base.y + runtime.lift,
        runtime.base.z,
      );
      TEMP_SCALE.setScalar(runtime.scale);
      SEAT_MATRIX.compose(TEMP_POSITION, runtime.quaternion, TEMP_SCALE);

      for (const key of STATE_KEYS) {
        const visible = key === state;
        TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.cushion);
        writeBatchMatrix(cushionBatches[key], index, visible ? TEMP_MATRIX : ZERO_MATRIX);
        TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.back);
        writeBatchMatrix(backBatches[key], index, visible ? TEMP_MATRIX : ZERO_MATRIX);
      }

      TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.pedestal);
      writeBatchMatrix(pedestalBatch, index, TEMP_MATRIX);
      TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.armLeft);
      writeBatchMatrix(armBatch, index * 2, TEMP_MATRIX);
      TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.armRight);
      writeBatchMatrix(armBatch, index * 2 + 1, TEMP_MATRIX);
      TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.postLeft);
      writeBatchMatrix(postBatch, index * 2, TEMP_MATRIX);
      TEMP_MATRIX.multiplyMatrices(SEAT_MATRIX, local.postRight);
      writeBatchMatrix(postBatch, index * 2 + 1, TEMP_MATRIX);

      TEMP_OBJECT.position.set(
        runtime.base.x + runtime.spread,
        runtime.base.y + 0.012,
        runtime.base.z,
      );
      TEMP_OBJECT.rotation.set(-Math.PI / 2, 0, 0);
      const liftFraction = clamp(runtime.lift / selectionTuning.lift, 0, 1);
      TEMP_OBJECT.scale.setScalar(1 + liftFraction * 0.18);
      TEMP_OBJECT.updateMatrix();
      writeBatchMatrix(contactBatch, index, TEMP_OBJECT.matrix);
    };

    const setStaticSeatVisible = (
      index: number,
      runtime: RuntimeSeat,
      state: SalonSeatState,
      visible: boolean,
    ) => {
      writeSeatGeometry(index, runtime, visible ? state : "free");
      if (!visible) {
        for (const key of STATE_KEYS) {
          writeBatchMatrix(cushionBatches[key], index, ZERO_MATRIX);
          writeBatchMatrix(backBatches[key], index, ZERO_MATRIX);
        }
        writeBatchMatrix(pedestalBatch, index, ZERO_MATRIX);
        writeBatchMatrix(armBatch, index * 2, ZERO_MATRIX);
        writeBatchMatrix(armBatch, index * 2 + 1, ZERO_MATRIX);
        writeBatchMatrix(postBatch, index * 2, ZERO_MATRIX);
        writeBatchMatrix(postBatch, index * 2 + 1, ZERO_MATRIX);
        writeBatchMatrix(contactBatch, index, ZERO_MATRIX);
      }
    };

    const getSeatVisual = (
      index: number,
      runtime: RuntimeSeat,
      state: SalonSeatState,
    ) => {
      if (runtime.visual) return runtime.visual;
      const visual =
        visualPool.find((candidate) => candidate.seatIndex === -1) ??
        visualPool[nextVisualIndex];
      nextVisualIndex = (nextVisualIndex + 1) % visualPool.length;
      if (visual.seatIndex !== -1) {
        const previous = runtimeSeats[visual.seatIndex];
        if (previous) {
          writeSeatGeometry(visual.seatIndex, previous, previous.renderedState);
          previous.visual = null;
        }
      }

      visual.seatIndex = index;
      visual.group.visible = true;
      visual.contact.visible = true;
      visual.cushion.material = fabricMaterials[state];
      visual.back.material = fabricMaterials[state];
      runtime.visual = visual;
      setStaticSeatVisible(index, runtime, state, false);
      return visual;
    };

    const updateSeatVisual = (
      visual: SeatVisual,
      runtime: RuntimeSeat,
      state: SalonSeatState,
    ) => {
      visual.cushion.material = fabricMaterials[state];
      visual.back.material = fabricMaterials[state];
      TEMP_POSITION.set(
        runtime.base.x + runtime.spread,
        runtime.base.y + runtime.lift,
        runtime.base.z,
      );
      TEMP_SCALE.setScalar(runtime.scale);
      visual.group.matrix.compose(TEMP_POSITION, runtime.quaternion, TEMP_SCALE);

      visual.contact.position.set(
        runtime.base.x + runtime.spread,
        runtime.base.y + 0.012,
        runtime.base.z,
      );
      const liftFraction = clamp(runtime.lift / selectionTuning.lift, 0, 1);
      visual.contact.scale.setScalar(1 + liftFraction * 0.18);
      visual.contact.updateMatrix();
    };

    const releaseSeatVisual = (
      index: number,
      runtime: RuntimeSeat,
      state: SalonSeatState,
    ) => {
      const visual = runtime.visual;
      if (!visual) return;
      writeSeatGeometry(index, runtime, state);
      visual.group.visible = false;
      visual.contact.visible = false;
      visual.seatIndex = -1;
      runtime.visual = null;
    };

    for (let index = 0; index < runtimeSeats.length; index += 1) {
      writeSeatGeometry(index, runtimeSeats[index], controls.seatsRef.current[index].state);
    }

    const cameraTarget = new THREE.Vector3();
    const projectedPoint = new THREE.Vector3();
    let previousTime = performance.now() * 0.001;
    let lastTheta = Infinity;
    let lastPhi = Infinity;
    let lastRadius = Infinity;
    let lastMode: SalonViewMode | null = null;
    let lastPovSeatIndex: number | null = null;

    const render = (timestamp: number) => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      if (camera.aspect !== width / height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      }

      const time = timestamp * 0.001;
      const dt = Math.min(Math.max(time - previousTime, 1 / 120), 0.05);
      previousTime = time;
      const seats = controls.seatsRef.current;
      const orbit = controls.orbitRef.current;
      const mode = controls.modeRef.current;
      const povSeatIndex = controls.povSeatIndexRef.current;
      const cameraDirty =
        Math.abs(orbit.theta - lastTheta) > 0.0001 ||
        Math.abs(orbit.phi - lastPhi) > 0.0001 ||
        Math.abs(orbit.radius - lastRadius) > 0.0001 ||
        mode !== lastMode ||
        povSeatIndex !== lastPovSeatIndex;

      if (mode === "pov" && povSeatIndex !== null && runtimeSeats[povSeatIndex]) {
        const runtime = runtimeSeats[povSeatIndex];
        camera.position.set(
          runtime.base.x + runtime.spread,
          runtime.base.y + runtime.lift + 0.92,
          runtime.base.z + 0.54,
        );
        cameraTarget.set(orbit.povYaw * 4.2, 2.75 + orbit.povPitch * 2.2, SCREEN_Z);
      } else {
        const phi = clamp(orbit.phi, 0.48, 1.22);
        const radius = clamp(orbit.radius, 13.5, 34);
        camera.position.set(
          Math.sin(orbit.theta) * Math.sin(phi) * radius,
          Math.cos(phi) * radius + 2.6,
          Math.cos(orbit.theta) * Math.sin(phi) * radius + 1.4,
        );
        cameraTarget.set(0, 1.95, -2.4);
      }
      camera.lookAt(cameraTarget);

      if (cameraDirty) {
        lastTheta = orbit.theta;
        lastPhi = orbit.phi;
        lastRadius = orbit.radius;
        lastMode = mode;
        lastPovSeatIndex = povSeatIndex;
      }

      for (let index = 0; index < runtimeSeats.length; index += 1) {
        const runtime = runtimeSeats[index];
        const seat = seats[index];
        const isMine = seat.state === "mine";
        let stateChanged = false;

        if (seat.state !== runtime.renderedState) {
          stateChanged = true;
          runtime.renderedState = seat.state;
          if (isMine) {
            runtime.liftVelocity = selectionTuning.kick;
          }
          const ring = ringPool[nextRingIndex];
          nextRingIndex = (nextRingIndex + 1) % ringPool.length;
          ring.seatIndex = index;
          ring.age = 0;
          ring.color.setHex(isMine ? 0xe5b45b : 0x2dd4bf);
        }

        const col = seat.col;
        const hasMineNeighbor =
          (col > 0 && seats[index - 1]?.state === "mine") ||
          (col < COLS - 1 && seats[index + 1]?.state === "mine");
        const targetLift = isMine ? selectionTuning.lift : 0;
        const targetSpread =
          hasMineNeighbor && !isMine ? (col < COLS / 2 ? -0.16 : 0.16) : 0;
        const targetScale = isMine ? selectionTuning.scale : 1;
        const active =
          stateChanged ||
          Math.abs(runtime.lift - targetLift) > 0.001 ||
          Math.abs(runtime.liftVelocity) > 0.001 ||
          Math.abs(runtime.spread - targetSpread) > 0.001 ||
          Math.abs(runtime.spreadVelocity) > 0.001 ||
          Math.abs(runtime.scale - targetScale) > 0.001 ||
          seat.shake > 0;

        if (active) {
          const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
          const h = dt / steps;
          for (let i = 0; i < steps; i += 1) {
            const liftSpring = integrateSpring(
              runtime.lift,
              runtime.liftVelocity,
              targetLift,
              h,
              selectionTuning,
            );
            const spreadSpring = integrateSpring(
              runtime.spread,
              runtime.spreadVelocity,
              targetSpread,
              h,
              selectionTuning,
            );
            runtime.lift = liftSpring.value;
            runtime.liftVelocity = liftSpring.velocity;
            runtime.spread = spreadSpring.value;
            runtime.spreadVelocity = spreadSpring.velocity;
          }

          if (seat.shake > 0) {
            const shakeX = Math.sin(seat.shake * 40) * 0.05 * seat.shake;
            runtime.spread += shakeX;
            seat.shake = Math.max(0, seat.shake - dt * 3);
          }

          runtime.scale = mix(runtime.scale, targetScale, Math.min(1, dt * 8));
          updateSeatVisual(getSeatVisual(index, runtime, seat.state), runtime, seat.state);
        } else if (runtime.visual) {
          releaseSeatVisual(index, runtime, seat.state);
        }

        if (cameraDirty || active) {
          TEMP_POSITION.set(
            runtime.base.x + runtime.spread,
            runtime.base.y + runtime.lift + 0.42,
            runtime.base.z,
          );
          projectedPoint.copy(TEMP_POSITION).project(camera);
          const distance = camera.position.distanceTo(TEMP_POSITION);
          runtime.projected.x = projectedPoint.x;
          runtime.projected.y = projectedPoint.y;
          runtime.projected.depth = distance;
          if (projectedPoint.z > -1 && projectedPoint.z < 1) {
            runtime.projected.radiusX = clamp(1.1 / distance, 0.05, 0.14);
            runtime.projected.radiusY = clamp(0.82 / distance, 0.038, 0.105);
          } else {
            runtime.projected.radiusX = 0;
            runtime.projected.radiusY = 0;
          }
          runtime.projected.state = seat.state;
        }
      }

      for (const ring of ringPool) {
        if (ring.age >= PULSE_DURATION) {
          if (ring.mesh.visible) {
            ring.mesh.visible = false;
          }
          continue;
        }

        const runtime = runtimeSeats[ring.seatIndex];
        const k = ring.age / PULSE_DURATION;
        const scale = 1 + k * 2.6;
        ring.mesh.visible = true;
        ring.mesh.position.set(
          runtime.base.x + runtime.spread,
          runtime.base.y + 0.02,
          runtime.base.z,
        );
        ring.mesh.scale.set(scale, scale, 1);
        ring.mesh.material.opacity = 0.6 * (1 - k) * (1 - k);
        ring.mesh.material.color.copy(ring.color);
        ring.mesh.updateMatrix();
        ring.age += dt;
      }

      controls.projectedSeatsRef.current = projectedSeats;
      screenLight.intensity = 0.25 + Math.sin(time * Math.PI * 1.6) * 0.025;

      renderer.render(scene, camera);
    };

    return render;
  };
