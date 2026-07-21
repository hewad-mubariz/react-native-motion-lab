import {
  makeSalonSelectionScene,
  type ProjectedSalonSeat,
  type SalonOrbit,
  type SalonSeat,
  type SalonViewMode,
} from "@/scenes/salon-selection";
import { useCallback, useMemo, useRef, useState } from "react";
import { LayoutChangeEvent } from "react-native";
import { useWebGPU } from "./useWebGPU";

const ROWS = 8;
const COLS = 12;
const ROW_LABELS = "ABCDEFGH";
const MIN_ORBIT_RADIUS = 10.8;
const MAX_ORBIT_RADIUS = 34;
const DEFAULT_ORBIT = {
  theta: 0,
  phi: 0.82,
  radius: 17.6,
  povYaw: 0,
  povPitch: 0,
} satisfies SalonOrbit;
export const SALON_SEAT_PRICE = 12.5;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const seededOccupied = (row: number, col: number) => {
  const n = Math.sin((row + 1) * 13.31 + (col + 2) * 7.17) * 43758.5453;
  const r = n - Math.floor(n);
  return r < 0.24 && !(row === 3 && col > 4 && col < 8);
};

const createSeats = (): SalonSeat[] =>
  Array.from({ length: ROWS * COLS }, (_, index) => {
    const row = Math.floor(index / COLS);
    const col = index % COLS;
    return {
      row,
      col,
      label: `${ROW_LABELS[row]}${col + 1}`,
      state: seededOccupied(row, col) ? "taken" : "free",
      shake: 0,
    };
  });

const findSeatHit = (
  projectedSeats: readonly ProjectedSalonSeat[],
  width: number,
  height: number,
  x: number,
  y: number,
) => {
  const ndcX = (x / Math.max(width, 1)) * 2 - 1;
  const ndcY = 1 - (y / Math.max(height, 1)) * 2;
  let bestIndex: number | null = null;
  let bestScore = Infinity;
  let bestDepth = Infinity;

  for (const seat of projectedSeats) {
    const radiusX = Math.max(seat.radiusX, 88 / Math.max(width, 1));
    const radiusY = Math.max(seat.radiusY, 72 / Math.max(height, 1));
    if (radiusX <= 0 || radiusY <= 0) continue;

    const dx = ndcX - seat.x;
    const dy = ndcY - seat.y;
    const score = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
    if (score > 1) continue;

    const closeScore = Math.abs(score - bestScore) < 0.12;
    if (score < bestScore || (closeScore && seat.depth < bestDepth)) {
      bestIndex = seat.index;
      bestScore = score;
      bestDepth = seat.depth;
    }
  }

  return bestIndex;
};

export const useSalonSelectionScene = () => {
  const [, setRevision] = useState(0);
  const seatsRef = useRef<SalonSeat[]>(createSeats());
  const orbitRef = useRef<SalonOrbit>({ ...DEFAULT_ORBIT });
  const modeRef = useRef<SalonViewMode>("overview");
  const povSeatIndexRef = useRef<number | null>(null);
  const projectedSeatsRef = useRef<ProjectedSalonSeat[]>([]);
  const layoutRef = useRef({ width: 1, height: 1 });
  const dragStartRef = useRef({
    theta: DEFAULT_ORBIT.theta,
    phi: DEFAULT_ORBIT.phi,
    povYaw: 0,
    povPitch: 0,
  });
  const pinchStartRadiusRef = useRef(orbitRef.current.radius);

  const scene = useMemo(
    () =>
      makeSalonSelectionScene({
        seatsRef,
        orbitRef,
        modeRef,
        povSeatIndexRef,
        projectedSeatsRef,
      }),
    [],
  );
  const canvasRef = useWebGPU(scene, { alphaMode: "opaque" });

  const selectedSeats = seatsRef.current
    .filter((seat) => seat.state === "mine")
    .map((seat) => seat.label);

  const selectedCount = selectedSeats.length;
  const selectedTotal = selectedSeats.length * SALON_SEAT_PRICE;
  const toggleSeat = useCallback(
    (index: number) => {
      const seat = seatsRef.current[index];
      if (!seat) return false;

      if (seat.state === "taken") {
        seat.shake = 1;
        return false;
      }

      seat.state = seat.state === "mine" ? "free" : "mine";
      setRevision((revision) => revision + 1);
      return true;
    },
    [],
  );

  const hitTest = useCallback((x: number, y: number) => {
    const { width, height } = layoutRef.current;
    return findSeatHit(projectedSeatsRef.current, width, height, x, y);
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }, []);

  const handleTap = useCallback(
    (x: number, y: number) => {
      const hit = hitTest(x, y);
      if (hit === null) return;
      toggleSeat(hit);
    },
    [hitTest, toggleSeat],
  );

  const handleDragStart = useCallback(() => {
    dragStartRef.current = {
      theta: orbitRef.current.theta,
      phi: orbitRef.current.phi,
      povYaw: orbitRef.current.povYaw,
      povPitch: orbitRef.current.povPitch,
    };
  }, []);

  const handleDragUpdate = useCallback((translationX: number, translationY: number) => {
    const start = dragStartRef.current;
    if (modeRef.current === "pov") {
      orbitRef.current.povYaw = clamp(start.povYaw + translationX * 0.004, -0.72, 0.72);
      orbitRef.current.povPitch = clamp(start.povPitch - translationY * 0.003, -0.45, 0.38);
      return;
    }

    orbitRef.current.theta = start.theta - translationX * 0.005;
    orbitRef.current.phi = clamp(start.phi - translationY * 0.0035, 0.5, 1.18);
  }, []);

  const handlePinchStart = useCallback(() => {
    pinchStartRadiusRef.current = orbitRef.current.radius;
  }, []);

  const handlePinchUpdate = useCallback((scale: number) => {
    if (modeRef.current === "pov") return;
    orbitRef.current.radius = clamp(
      pinchStartRadiusRef.current / Math.max(scale, 0.05),
      MIN_ORBIT_RADIUS,
      MAX_ORBIT_RADIUS,
    );
  }, []);

  const exitPov = useCallback(() => {
    povSeatIndexRef.current = null;
    modeRef.current = "overview";
  }, []);

  const resetView = useCallback(() => {
    orbitRef.current = { ...DEFAULT_ORBIT };
    povSeatIndexRef.current = null;
    modeRef.current = "overview";
    setRevision((revision) => revision + 1);
  }, []);

  const bookSelectedSeats = useCallback(() => {
    const seats = seatsRef.current.filter((seat) => seat.state === "mine");
    if (seats.length === 0) {
      return;
    }

    for (const seat of seats) {
      seat.state = "taken";
    }
    exitPov();
    setRevision((revision) => revision + 1);
  }, [exitPov]);

  return {
    canvasRef,
    handleLayout,
    handleTap,
    handleDragStart,
    handleDragUpdate,
    handlePinchStart,
    handlePinchUpdate,
    exitPov,
    resetView,
    bookSelectedSeats,
    selectedCount,
    selectedSeats,
    selectedTotal,
    toast: null,
  };
};
