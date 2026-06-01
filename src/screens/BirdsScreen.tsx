import { BirdsShapeTool, BirdsToolbar } from "@/components/birds-toolbar";
import { useBirdsScene } from "@/hooks/useBirdsScene";
import { BIRDS_SKY_PRESETS, BIRDS_SKY_PRESET_COUNT } from "@/scenes/birds";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas } from "react-native-wgpu";

export const BirdsScreen = () => {
  const [nameText, setNameText] = useState("");
  const [formationEnabled, setFormationEnabled] = useState(false);
  const [selectedShape, setSelectedShape] = useState<BirdsShapeTool>("text");
  const [skyPresetIndex, setSkyPresetIndex] = useState(0);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const { canvasRef, disturbAt, handleLayout } = useBirdsScene({
    formationEnabled,
    nameText,
    selectedShape,
    skyPresetIndex,
  });

  const cycleSkyPreset = () => {
    setSkyPresetIndex((i) => (i + 1) % BIRDS_SKY_PRESET_COUNT);
  };

  const singleTapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      disturbAt(event.x, event.y);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      setToolbarVisible((visible) => !visible);
    });

  const gesture = Gesture.Exclusive(doubleTapGesture, singleTapGesture);

  return (
    <View style={styles.screen} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>
      {toolbarVisible ? (
        <BirdsToolbar
          nameText={nameText}
          nameModeEnabled={formationEnabled}
          onNameSubmit={setNameText}
          onNameModeChange={setFormationEnabled}
          onShapeSelect={setSelectedShape}
          skyPresetShortLabel={BIRDS_SKY_PRESETS[skyPresetIndex].shortLabel}
          skyPresetLabel={BIRDS_SKY_PRESETS[skyPresetIndex].label}
          onCycleSkyPreset={cycleSkyPreset}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0a0810",
  },
  canvas: {
    flex: 1,
  },
});
