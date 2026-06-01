import { makePixelExplosionScene } from "@/scenes/pixel-explosion";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent } from "react-native";
import { useWebGPU } from "./useWebGPU";

const tigerImageModule = require("../../assets/images/tiger.png");

interface UsePixelExplosionSceneOptions {
  particleSize: number;
  explosionForce: number;
  delayMode: "center" | "edges";
}

export const usePixelExplosionScene = ({
  particleSize,
  explosionForce,
  delayMode,
}: UsePixelExplosionSceneOptions) => {
  const triggerRef = useRef(0);
  const particleSizeRef = useRef(particleSize);
  const explosionForceRef = useRef(explosionForce);
  const delayModeRef = useRef(delayMode);
  const layoutRef = useRef({ width: 1, height: 1 });

  useEffect(() => {
    particleSizeRef.current = particleSize;
  }, [particleSize]);

  useEffect(() => {
    explosionForceRef.current = explosionForce;
  }, [explosionForce]);

  useEffect(() => {
    delayModeRef.current = delayMode;
  }, [delayMode]);

  const scene = useMemo(
    () =>
      makePixelExplosionScene(
        {
          triggerRef,
          particleSizeRef,
          explosionForceRef,
          delayModeRef,
        },
        { imageModule: tigerImageModule },
      ),
    [],
  );

  const canvasRef = useWebGPU(scene, { alphaMode: "opaque" });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }, []);

  const restart = useCallback(() => {
    triggerRef.current += 1;
  }, []);

  return { canvasRef, handleLayout, restart };
};
