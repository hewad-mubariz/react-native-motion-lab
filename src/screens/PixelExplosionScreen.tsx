import { useTigerParticlesScene } from "@/hooks/useTigerParticlesScene";
import Slider from "@react-native-community/slider";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas } from "react-native-wgpu";

export const PixelExplosionScreen = () => {
  const insets = useSafeAreaInsets();
  const [explosionProgress, setExplosionProgress] = useState(0);
  const [falling, setFalling] = useState(false);
  const [isShattered, setIsShattered] = useState(false);

  const { canvasRef, handleLayout } = useTigerParticlesScene({
    particleSize: 1.15,
    particleOpacity: 1,
    brightness: 1,
    colorMix: 1,
    sampleStep: 2,
    explosionProgress,
    explosionForce: 1.25,
    fallTarget: falling ? 1 : 0,
    shatterTarget: isShattered ? 1 : 0,
  });

  // Double-tap: shatter / reassemble the image
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(() => {
      setIsShattered((v) => !v);
    });

  // Long press: rain / reform
  const longPressGesture = Gesture.LongPress()
    .minDuration(400)
    .runOnJS(true)
    .onEnd(() => {
      setExplosionProgress(0);
      setIsShattered(false);
      setFalling((value) => !value);
    });

  const gesture = Gesture.Exclusive(doubleTapGesture, longPressGesture);

  return (
    <View style={styles.screen} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>

      <View style={[styles.sliderDock, { bottom: insets.bottom + 28 }]}>
        <Slider
          minimumValue={0}
          maximumValue={1}
          value={explosionProgress}
          onValueChange={setExplosionProgress}
          minimumTrackTintColor="#ff8a1f"
          maximumTrackTintColor="rgba(255, 138, 31, 0.24)"
          thumbTintColor="#ff8a1f"
          style={styles.slider}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#02040a",
  },
  canvas: {
    flex: 1,
  },
  sliderDock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  slider: {
    height: 36,
    width: 306,
  },
});
