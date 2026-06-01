import { useGalleryScene } from "@/hooks/useGalleryScene";
import { GALLERY_CONFIG } from "@/scenes/gallery/config";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas } from "react-native-wgpu";

export const GalleryScreen = () => {
  const insets = useSafeAreaInsets();
  const {
    canvasRef,
    handleLayout,
    handleTap,
    handleDoubleTap,
    handleDragStart,
    handleDragUpdate,
    handleDragEnd,
    handleWalkStart,
    handleWalkEnd,
    artworksLoading,
    artworkCount,
    loadedArtworkTextures,
  } = useGalleryScene();

  // Gestures via Race(composed):
  //   - Hold still for ~200ms          -> LongPress -> walk
  //   - Move >panMinDistance px        -> Pan       -> rotate
  //   - Double tap                      -> impulse forward along corridor
  //   - Single tap (after double window) -> focus painting / level view
  const longPress = Gesture.LongPress()
    .runOnJS(true)
    .minDuration(GALLERY_CONFIG.camera.longPressDuration)
    // Allow a little finger drift while held without dropping the walk.
    // A real drag will exceed this and Pan should win instead -- but Race
    // has already locked in LongPress at this point, so the drift cap
    // doubles as "stop walking if the finger wanders".
    .maxDistance(GALLERY_CONFIG.camera.longPressMaxDistance)
    .onStart(handleWalkStart)
    .onFinalize(handleWalkEnd);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(GALLERY_CONFIG.camera.panMinDistance)
    .onStart(handleDragStart)
    .onUpdate((event) => {
      handleDragUpdate(event.translationX, event.translationY);
    })
    .onFinalize(handleDragEnd);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(handleDoubleTap);

  const tap = Gesture.Tap()
    .numberOfTaps(1)
    .runOnJS(true)
    .onEnd((event) => {
      handleTap(event.x, event.y);
    });

  const taps = Gesture.Exclusive(doubleTap, tap);
  const gesture = Gesture.Race(longPress, pan, taps);

  return (
    <View style={styles.screen} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>
      {(artworksLoading ||
        (artworkCount > 0 && loadedArtworkTextures < artworkCount)) && (
        <View
          pointerEvents="none"
          style={[styles.loader, { top: insets.top + 14 }]}
        >
          {artworksLoading ? (
            <ActivityIndicator color="rgba(245, 232, 202, 0.88)" />
          ) : null}
          <Text style={styles.loaderText}>
            {artworkCount > 0
              ? `Curating gallery ${Math.min(
                  loadedArtworkTextures,
                  artworkCount,
                )}/${artworkCount}`
              : "Curating gallery"}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#06050a",
  },
  canvas: {
    flex: 1,
  },
  loader: {
    position: "absolute",
    left: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    backgroundColor: "rgba(14, 12, 10, 0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245, 232, 202, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  loaderText: {
    color: "rgba(245, 232, 202, 0.82)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
});
