import { makeFurnitureScene, type OrbitState } from "@/scenes/furniture-showcase";
import { resolveFurnitureModelUri } from "@/utils/furniture-assets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWebGPU } from "./useWebGPU";

const PITCH_LIMIT = 1.05;
const DEFAULT_ORBIT: OrbitState = {
  yaw: -0.55,
  pitch: 0.28,
  distance: 3.15,
};
const MIN_DISTANCE = 1.35;
const MAX_DISTANCE = 6.25;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

interface UseFurnitureSceneOptions {
  model: number;
}

export const useFurnitureScene = ({ model }: UseFurnitureSceneOptions) => {
  const orbitRef = useRef<OrbitState>({ ...DEFAULT_ORBIT });
  const dragStartRef = useRef<OrbitState>(orbitRef.current);
  const pinchStartDistanceRef = useRef(orbitRef.current.distance);
  const [modelError, setModelError] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [readyModel, setReadyModel] = useState<number | null>(null);
  const [modelUri, setModelUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAsset = async () => {
      setModelError(false);
      setModelReady(false);
      setReadyModel(null);
      setModelUri(null);
      orbitRef.current = { ...DEFAULT_ORBIT };

      const uri = await resolveFurnitureModelUri(model);

      if (!cancelled) {
        setModelUri(uri);
      }
    };

    void loadAsset();

    return () => {
      cancelled = true;
    };
  }, [model]);

  const handleSceneReady = useCallback(() => {
    setModelReady(true);
    setReadyModel(model);
  }, [model]);

  const handleSceneError = useCallback((error: unknown) => {
    console.warn("Failed to load furniture model", error);
    setModelError(true);
    setModelReady(false);
  }, []);

  const scene = useMemo(() => {
    if (!modelUri) {
      return () => () => {};
    }

    return makeFurnitureScene(
      {
        orbitRef,
      },
      {
        modelUri,
      },
    );
  }, [modelUri]);
  const canvasRef = useWebGPU(scene, {
    alphaMode: "opaque",
    onError: handleSceneError,
    onReady: handleSceneReady,
  });

  const handlePanStart = useCallback(() => {
    dragStartRef.current = { ...orbitRef.current };
  }, []);

  const handlePanUpdate = useCallback(
    (translationX: number, translationY: number) => {
      orbitRef.current = {
        ...orbitRef.current,
        yaw: dragStartRef.current.yaw - translationX * 0.006,
        pitch: clamp(
          dragStartRef.current.pitch + translationY * 0.005,
          -PITCH_LIMIT,
          PITCH_LIMIT,
        ),
      };
    },
    [],
  );

  const handlePinchStart = useCallback(() => {
    pinchStartDistanceRef.current = orbitRef.current.distance;
  }, []);

  const handlePinchUpdate = useCallback((scale: number) => {
    orbitRef.current = {
      ...orbitRef.current,
      distance: clamp(
        pinchStartDistanceRef.current / Math.max(scale, 0.1),
        MIN_DISTANCE,
        MAX_DISTANCE,
      ),
    };
  }, []);

  const resetCamera = useCallback(() => {
    orbitRef.current = { ...DEFAULT_ORBIT };
  }, []);

  return {
    canvasRef,
    modelError,
    modelLoading: readyModel !== model || !modelUri || !modelReady,
    resetCamera,
    handlePanStart,
    handlePanUpdate,
    handlePinchStart,
    handlePinchUpdate,
  };
};
