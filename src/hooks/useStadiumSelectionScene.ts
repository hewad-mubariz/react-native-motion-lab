import {
  makeStadiumSelectionScene,
  STADIUM_SEAT_PRICE,
  type ProjectedStadiumSeat,
  type StadiumCameraSnapshot,
  type StadiumOrbit,
  type StadiumSeat,
} from "@/scenes/stadium-selection";
import { useCallback, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useWebGPU } from "./useWebGPU";

const SECTIONS = 28;
const ROWS = 45;
const COLS = 48;
const MIN_RADIUS = 6.4;
const MAX_RADIUS = 255;
// Above this radius taps fly the camera into the section; below they select seats.
const FLY_IN_THRESHOLD = 55;
const SECTION_FOCUS_RADIUS = 15;
const OVERVIEW_RECENTER_RADIUS = 72;
const DEFAULT_ORBIT = {
  theta: 0.62,
  phi: 1.08,
  radius: 120,
  targetX: 0,
  targetY: 10,
  targetZ: 0,
  ringAngle: 0,
  rowHeight: 0.35,
} satisfies StadiumOrbit;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const seededReserved = (section: number, row: number, col: number) => {
  const n =
    Math.sin((section + 3) * 17.17 + (row + 2) * 9.31 + (col + 1) * 5.13) *
    43758.5453;
  return n - Math.floor(n) < 0.11;
};

const createSeats = (): StadiumSeat[] =>
  Array.from({ length: SECTIONS * ROWS * COLS }, (_, index) => {
    const perSection = ROWS * COLS;
    const section = Math.floor(index / perSection);
    const local = index % perSection;
    const row = Math.floor(local / COLS);
    const col = local % COLS;
    return {
      section,
      row,
      col,
      label: `B${section + 1}-R${row + 1}-S${col + 1}`,
      state: seededReserved(section, row, col) ? "taken" : "free",
      shake: 0,
    };
  });

const findSeatHit = (
  projectedSeats: readonly ProjectedStadiumSeat[],
  width: number,
  height: number,
  x: number,
  y: number,
  orbit: StadiumOrbit,
  camera: StadiumCameraSnapshot,
) => {
  const ndcX = (x / Math.max(width, 1)) * 2 - 1;
  const ndcY = 1 - (y / Math.max(height, 1)) * 2;
  const minRadiusX = 18 / Math.max(width, 1);
  const minRadiusY = 16 / Math.max(height, 1);
  let bestIndex: number | null = null;
  let bestScore = Infinity;
  let bestDepth = Infinity;
  const focusedSection =
    orbit.radius < FLY_IN_THRESHOLD
      ? Math.round(
          ((((orbit.ringAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) /
            (Math.PI * 2)) *
            SECTIONS -
            0.5,
        ) % SECTIONS
      : null;

  const testSeat = (seat: ProjectedStadiumSeat) => {
    let seatX = seat.x;
    let seatY = seat.y;
    let seatDepth = seat.depth;
    let seatRadiusX = seat.radiusX;
    let seatRadiusY = seat.radiusY;
    let visible = seat.visible;
    if (camera.ready) {
      if (seat.worldY < -1000) return;
      const m = camera.viewProjection;
      const worldX = seat.worldX;
      const worldY = seat.worldY;
      const worldZ = seat.worldZ;
      const clipW = m[3] * worldX + m[7] * worldY + m[11] * worldZ + m[15];
      if (clipW <= 0) return;
      const inverseW = 1 / clipW;
      seatX =
        (m[0] * worldX + m[4] * worldY + m[8] * worldZ + m[12]) * inverseW;
      seatY =
        (m[1] * worldX + m[5] * worldY + m[9] * worldZ + m[13]) * inverseW;
      const ndcZ =
        (m[2] * worldX + m[6] * worldY + m[10] * worldZ + m[14]) * inverseW;
      const cameraDx = worldX - camera.x;
      const cameraDy = worldY - camera.y;
      const cameraDz = worldZ - camera.z;
      seatDepth = Math.hypot(cameraDx, cameraDy, cameraDz);
      seatRadiusX = clamp(1.8 / seatDepth, 0.008, 0.045);
      seatRadiusY = clamp(1.4 / seatDepth, 0.006, 0.035);
      visible =
        seatX >= -1.1 &&
        seatX <= 1.1 &&
        seatY >= -1.1 &&
        seatY <= 1.1 &&
        ndcZ >= 0 &&
        ndcZ <= 1;
    }
    if (!visible) return;
    const radiusX = Math.max(seatRadiusX, minRadiusX);
    const radiusY = Math.max(seatRadiusY, minRadiusY);
    const dx = ndcX - seatX;
    const dy = ndcY - seatY;
    const score =
      (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
    if (score > 1) return;
    const closeScore = Math.abs(score - bestScore) < 0.01;
    if (score < bestScore || (closeScore && seatDepth < bestDepth)) {
      bestIndex = seat.index;
      bestScore = score;
      bestDepth = seatDepth;
    }
  };

  if (focusedSection === null) {
    for (let index = 0; index < projectedSeats.length; index += 1) {
      testSeat(projectedSeats[index]);
    }
  } else {
    const seatsPerSection = ROWS * COLS;
    for (let sectionOffset = -2; sectionOffset <= 2; sectionOffset += 1) {
      const section = (focusedSection + sectionOffset + SECTIONS) % SECTIONS;
      const end = Math.min(
        (section + 1) * seatsPerSection,
        projectedSeats.length,
      );
      for (let index = section * seatsPerSection; index < end; index += 1) {
        testSeat(projectedSeats[index]);
      }
    }
  }

  return bestIndex;
};

export const useStadiumSelectionScene = () => {
  const [, setRevision] = useState(0);
  const seatsRef = useRef<StadiumSeat[]>(createSeats());
  const orbitRef = useRef<StadiumOrbit>({ ...DEFAULT_ORBIT });
  const cameraSnapshotRef = useRef<StadiumCameraSnapshot>({
    viewProjection: new Float32Array(16),
    x: 0,
    y: 0,
    z: 0,
    ready: false,
  });
  const projectedSeatsRef = useRef<ProjectedStadiumSeat[]>([]);
  const dirtySeatIndicesRef = useRef(new Set<number>());
  const layoutRef = useRef({ width: 1, height: 1 });
  const dragStartRef = useRef({ ...DEFAULT_ORBIT });
  const pinchStartRadiusRef = useRef(DEFAULT_ORBIT.radius);
  const pinchFocusRef = useRef<{
    targetX: number;
    targetY: number;
    targetZ: number;
    ringAngle: number;
    rowHeight: number;
  } | null>(null);
  const pinchFocusAppliedRef = useRef(false);
  const wakeRef = useRef<(() => void) | null>(null);
  const pinchCountRef = useRef(0);
  const isPinchingRef = useRef(false);

  const pinchStart = useCallback(() => {
    pinchCountRef.current += 1;
    isPinchingRef.current = true;
  }, []);

  const pinchEnd = useCallback(() => {
    pinchCountRef.current = Math.max(0, pinchCountRef.current - 1);
    isPinchingRef.current = pinchCountRef.current > 0;
  }, []);

  const scene = useMemo(
    () =>
      makeStadiumSelectionScene({
        seatsRef,
        orbitRef,
        cameraSnapshotRef,
        projectedSeatsRef,
        dirtySeatIndicesRef,
        isPinchingRef,
      }),
    [],
  );
  const canvasRef = useWebGPU(scene, {
    alphaMode: "opaque",
    maxPixelRatio: 2,
    wakeRef,
  });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }, []);

  const handleTap = useCallback((x: number, y: number) => {
    wakeRef.current?.();
    const { width, height } = layoutRef.current;
    const hit = findSeatHit(
      projectedSeatsRef.current,
      width,
      height,
      x,
      y,
      orbitRef.current,
      cameraSnapshotRef.current,
    );

    if (orbitRef.current.radius >= FLY_IN_THRESHOLD) {
      // Zoomed out: focus the exact area that was tapped without rotating the view.
      if (hit !== null) {
        const projected = projectedSeatsRef.current[hit];
        if (projected) {
          const section = Math.floor(hit / (ROWS * COLS));
          const row = Math.floor((hit % (ROWS * COLS)) / COLS);
          orbitRef.current.targetX = projected.worldX;
          orbitRef.current.targetY = projected.worldY + 0.5;
          orbitRef.current.targetZ = projected.worldZ;
          orbitRef.current.ringAngle =
            ((section + 0.5) / SECTIONS) * Math.PI * 2;
          orbitRef.current.rowHeight = row / (ROWS - 1);
          orbitRef.current.radius = SECTION_FOCUS_RADIUS;
        }
      }
      return;
    }

    // Zoomed in: tap selects / deselects the seat.
    if (hit === null) return;
    const projected = projectedSeatsRef.current[hit];
    const seat = seatsRef.current[hit];
    if (seat?.state === "taken") {
      seat.shake = 1;
      dirtySeatIndicesRef.current.add(hit);
      return;
    }
    if (seat) {
      seat.state = seat.state === "mine" ? "free" : "mine";
      dirtySeatIndicesRef.current.add(hit);
      if (projected) projected.state = seat.state;
      setRevision((revision) => revision + 1);
    }
  }, []);

  const clearSelection = useCallback(() => {
    let changed = false;
    for (let index = 0; index < seatsRef.current.length; index += 1) {
      const seat = seatsRef.current[index];
      if (seat.state !== "mine") continue;
      seat.state = "free";
      dirtySeatIndicesRef.current.add(index);
      const projected = projectedSeatsRef.current[index];
      if (projected) projected.state = "free";
      changed = true;
    }
    if (changed) setRevision((revision) => revision + 1);
  }, []);

  const handleDragStart = useCallback(() => {
    wakeRef.current?.();
    if (orbitRef.current.radius >= OVERVIEW_RECENTER_RADIUS) {
      orbitRef.current.targetX = DEFAULT_ORBIT.targetX;
      orbitRef.current.targetY = DEFAULT_ORBIT.targetY;
      orbitRef.current.targetZ = DEFAULT_ORBIT.targetZ;
    }
    dragStartRef.current = { ...orbitRef.current };
  }, []);

  const handleDragEnd = useCallback(() => {}, []);

  const handleDragUpdate = useCallback(
    (translationX: number, translationY: number) => {
      const start = dragStartRef.current;
      orbitRef.current.theta = start.theta - translationX * 0.005;
      orbitRef.current.phi = clamp(
        start.phi - translationY * 0.004,
        0.12,
        1.42,
      );
    },
    [],
  );

  const handlePinchStart = useCallback(
    (x: number, y: number) => {
      wakeRef.current?.();
      pinchStart();
      pinchStartRadiusRef.current = orbitRef.current.radius;
      pinchFocusAppliedRef.current = false;
      pinchFocusRef.current = null;

      const { width, height } = layoutRef.current;
      const hit = findSeatHit(
        projectedSeatsRef.current,
        width,
        height,
        x,
        y,
        orbitRef.current,
        cameraSnapshotRef.current,
      );
      const projected = hit === null ? null : projectedSeatsRef.current[hit];
      if (projected && hit !== null) {
        const section = Math.floor(hit / (ROWS * COLS));
        const row = Math.floor((hit % (ROWS * COLS)) / COLS);
        pinchFocusRef.current = {
          targetX: projected.worldX,
          targetY: projected.worldY + 0.5,
          targetZ: projected.worldZ,
          ringAngle: ((section + 0.5) / SECTIONS) * Math.PI * 2,
          rowHeight: row / (ROWS - 1),
        };
      }
    },
    [pinchStart],
  );

  const handlePinchUpdate = useCallback((scale: number) => {
    const nextRadius = clamp(
      pinchStartRadiusRef.current / Math.max(scale, 0.05),
      MIN_RADIUS,
      MAX_RADIUS,
    );
    if (
      scale > 1.01 &&
      !pinchFocusAppliedRef.current &&
      pinchFocusRef.current
    ) {
      Object.assign(orbitRef.current, pinchFocusRef.current);
      pinchFocusAppliedRef.current = true;
    } else if (scale < 1 && nextRadius >= OVERVIEW_RECENTER_RADIUS) {
      orbitRef.current.targetX = DEFAULT_ORBIT.targetX;
      orbitRef.current.targetY = DEFAULT_ORBIT.targetY;
      orbitRef.current.targetZ = DEFAULT_ORBIT.targetZ;
    }
    orbitRef.current.radius = nextRadius;
  }, []);

  const handlePinchEnd = useCallback(() => {
    pinchFocusRef.current = null;
    pinchFocusAppliedRef.current = false;
    pinchEnd();
  }, [pinchEnd]);

  const selected = seatsRef.current.filter((seat) => seat.state === "mine");
  const selectedSeats = selected.map((seat) => seat.label);
  const selectedCount = selected.length;
  const selectedTotal = selectedCount * STADIUM_SEAT_PRICE;
  const selectedTiers = new Set(
    selected.map((seat) => (seat.row < 26 ? "Lower bowl" : "Upper deck")),
  );
  const selectedCategory =
    selectedTiers.size === 0
      ? "Not selected"
      : selectedTiers.size === 1
        ? [...selectedTiers][0]
        : "Mixed tiers";

  return {
    canvasRef,
    handleLayout,
    handleTap,
    handleDragStart,
    handleDragEnd,
    handleDragUpdate,
    handlePinchStart,
    handlePinchUpdate,
    handlePinchEnd,
    clearSelection,
    selectedCategory,
    selectedCount,
    selectedSeats,
    selectedTotal,
  };
};
