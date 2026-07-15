import { useWebGPU } from "@/hooks/useWebGPU";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LayoutChangeEvent } from "react-native";
import type { MetricKey } from "../types";
import { makeChartGpuScene } from "./chartGpuScene";

type UseChartGpuSceneOptions = {
  activeMetric: MetricKey;
  cityBuilt: boolean;
  enabled: boolean;
  nightOn: boolean;
  selectedCatIndex: number | null;
};

export const useChartGpuScene = ({
  activeMetric,
  cityBuilt,
  enabled,
  nightOn,
  selectedCatIndex,
}: UseChartGpuSceneOptions) => {
  const activeMetricRef = useRef(activeMetric);
  const cityBuiltRef = useRef(cityBuilt);
  const nightOnRef = useRef(nightOn);
  const selectedCatIndexRef = useRef(selectedCatIndex);
  const layoutRef = useRef({ width: 1, height: 1 });

  useEffect(() => {
    activeMetricRef.current = activeMetric;
  }, [activeMetric]);

  useEffect(() => {
    cityBuiltRef.current = cityBuilt;
  }, [cityBuilt]);

  useEffect(() => {
    nightOnRef.current = nightOn;
  }, [nightOn]);

  useEffect(() => {
    selectedCatIndexRef.current = selectedCatIndex;
  }, [selectedCatIndex]);

  const scene = useMemo(
    () => {
      if (!enabled) {
        return () => undefined;
      }

      return makeChartGpuScene({
        activeMetricRef,
        cityBuiltRef,
        nightOnRef,
        selectedCatIndexRef,
      });
    },
    [enabled],
  );

  const canvasRef = useWebGPU(scene, { alphaMode: "opaque" });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  }, []);

  return { canvasRef, handleLayout };
};
