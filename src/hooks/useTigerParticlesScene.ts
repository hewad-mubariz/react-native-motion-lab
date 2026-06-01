import { makeTigerParticlesScene } from "@/scenes/pixel-explosion";
import { useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent } from "react-native";
import { useWebGPU } from "./useWebGPU";

const tigerImageModule = require("../../assets/images/tiger.png");

interface UseTigerParticlesSceneOptions {
  particleSize: number;
  particleOpacity: number;
  brightness: number;
  colorMix: number;
  sampleStep: number;
  explosionProgress: number;
  explosionForce: number;
  fallTarget: number;
  shatterTarget: number;
}

export const useTigerParticlesScene = ({
  particleSize,
  particleOpacity,
  brightness,
  colorMix,
  sampleStep,
  explosionProgress,
  explosionForce,
  fallTarget,
  shatterTarget,
}: UseTigerParticlesSceneOptions) => {
  const particleSizeRef = useRef(particleSize);
  const particleOpacityRef = useRef(particleOpacity);
  const brightnessRef = useRef(brightness);
  const colorMixRef = useRef(colorMix);
  const explosionProgressRef = useRef(explosionProgress);
  const explosionForceRef = useRef(explosionForce);
  const fallTargetRef = useRef(fallTarget);
  const shatterTargetRef = useRef(shatterTarget);

  useEffect(() => {
    particleSizeRef.current = particleSize;
  }, [particleSize]);

  useEffect(() => {
    particleOpacityRef.current = particleOpacity;
  }, [particleOpacity]);

  useEffect(() => {
    brightnessRef.current = brightness;
  }, [brightness]);

  useEffect(() => {
    colorMixRef.current = colorMix;
  }, [colorMix]);

  useEffect(() => {
    explosionProgressRef.current = explosionProgress;
  }, [explosionProgress]);

  useEffect(() => {
    explosionForceRef.current = explosionForce;
  }, [explosionForce]);

  useEffect(() => {
    fallTargetRef.current = fallTarget;
  }, [fallTarget]);

  useEffect(() => {
    shatterTargetRef.current = shatterTarget;
  }, [shatterTarget]);

  const scene = useMemo(
    () =>
      makeTigerParticlesScene(
        {
          particleSizeRef,
          particleOpacityRef,
          brightnessRef,
          colorMixRef,
          explosionProgressRef,
          explosionForceRef,
          fallTargetRef,
          shatterTargetRef,
        },
        { imageModule: tigerImageModule, sampleStep },
      ),
    [sampleStep],
  );
  const canvasRef = useWebGPU(scene, { alphaMode: "opaque" });

  const handleLayout = (_event: LayoutChangeEvent) => {};

  return { canvasRef, handleLayout };
};
