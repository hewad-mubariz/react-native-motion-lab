import type { BirdsShapeTool } from "@/components/birds-toolbar";
import { useEffect, useMemo, useRef } from "react";
import { LayoutChangeEvent } from "react-native";
import { makeBirdsScene, type DisturbanceState } from "@/scenes/birds";
import { useWebGPU } from "./useWebGPU";

interface UseBirdsSceneOptions {
  formationEnabled: boolean;
  nameText: string;
  selectedShape: BirdsShapeTool;
}

const DISTURBANCE_STRENGTH = 3.5;

/**
 * React-side wrapper around the bird scene. Owns the shared refs that bridge
 * React state (formation toggle, current shape, name) and imperative gesture
 * input (disturbance taps, layout) into the per-frame GPU render loop.
 */
export const useBirdsScene = ({
  formationEnabled,
  nameText,
  selectedShape,
}: UseBirdsSceneOptions) => {
  const layoutRef = useRef({ width: 1, height: 1 });
  const disturbanceRef = useRef<DisturbanceState>({ x: 0, y: 0, strength: 0 });
  const formationEnabledRef = useRef(formationEnabled);
  const selectedShapeRef = useRef<BirdsShapeTool>(selectedShape);
  const nameTextRef = useRef(nameText);
  const uploadFormationTargetsRef = useRef<
    (shape: BirdsShapeTool, name: string) => void
  >(() => {});

  useEffect(() => {
    formationEnabledRef.current = formationEnabled;
  }, [formationEnabled]);

  useEffect(() => {
    selectedShapeRef.current = selectedShape;
    nameTextRef.current = nameText;
    uploadFormationTargetsRef.current(selectedShape, nameText);
  }, [nameText, selectedShape]);

  // Build the scene once per hook lifetime. The scene captures the refs above
  // by reference, so it stays in sync with React state without needing to be
  // rebuilt.
  const scene = useMemo(
    () =>
      makeBirdsScene({
        formationEnabledRef,
        selectedShapeRef,
        nameTextRef,
        disturbanceRef,
        uploadFormationTargetsRef,
      }),
    [],
  );

  const canvasRef = useWebGPU(scene, { alphaMode: "opaque" });

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    layoutRef.current = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    };
  };

  const disturbAt = (x: number, y: number) => {
    const { width, height } = layoutRef.current;
    disturbanceRef.current = {
      x: (x / width) * 2 - 1,
      y: (1 - (y / height) * 2) * (height / width),
      strength: DISTURBANCE_STRENGTH,
    };
  };

  return { canvasRef, handleLayout, disturbAt };
};
