import { BirdsShapeTool, BirdsToolbar } from "@/components/birds-toolbar";
import { useBirdsScene } from "@/hooks/useBirdsScene";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Canvas } from "react-native-wgpu";

export const BirdsScreen = () => {
  const [nameText, setNameText] = useState("");
  const [formationEnabled, setFormationEnabled] = useState(false);
  const [selectedShape, setSelectedShape] = useState<BirdsShapeTool>("text");
  const { canvasRef, disturbAt, handleLayout } = useBirdsScene({
    formationEnabled,
    nameText,
    selectedShape,
  });

  const gesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      disturbAt(event.x, event.y);
    });

  return (
    <View style={styles.screen} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>
      <BirdsToolbar
        nameText={nameText}
        nameModeEnabled={formationEnabled}
        onNameSubmit={setNameText}
        onNameModeChange={setFormationEnabled}
        onShapeSelect={setSelectedShape}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#05070a",
  },
  canvas: {
    flex: 1,
  },
});
