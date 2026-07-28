import { NativeAnimatedText } from "@/components/NativeAnimatedText";
import { useStadiumSelectionScene } from "@/hooks/useStadiumSelectionScene";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas } from "react-native-wgpu";

export const StadiumSelectionScreen = () => {
  const insets = useSafeAreaInsets();
  const {
    canvasRef,
    handleLayout,
    handleTap,
    handleDragStart,
    handleDragEnd,
    handleDragUpdate,
    handlePinchStart,
    handlePinchUpdate,
    handlePinchEnd,
    clearSelection,
    selectedCategory,
    selectedCount,
    selectedSeats,
    selectedTotal,
  } = useStadiumSelectionScene();

  const hasSelection = selectedCount > 0;
  const totalCents = Math.round(selectedTotal * 100);
  const selectedPreview =
    selectedSeats.length === 0
      ? "No seats selected"
      : selectedSeats.slice(0, 2).join("  ");
  const selectedOverflow = Math.max(0, selectedSeats.length - 2);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .minDistance(4)
    .onStart(handleDragStart)
    .onUpdate((event) => {
      handleDragUpdate(event.translationX, event.translationY);
    })
    .onFinalize(handleDragEnd);

  const tap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(180)
    .maxDistance(10)
    .runOnJS(true)
    .onEnd((event) => {
      handleTap(event.x, event.y);
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart((event) => {
      handlePinchStart(event.focalX, event.focalY);
    })
    .onUpdate((event) => {
      handlePinchUpdate(event.scale);
    })
    .onFinalize(handlePinchEnd);

  const move = Gesture.Simultaneous(pan, pinch);
  const gesture = Gesture.Exclusive(move, tap);

  return (
    <View style={styles.screen} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>

      <View pointerEvents="box-none" style={styles.overlay}>
        <View
          style={[
            styles.bookingDock,
            { paddingBottom: Math.max(insets.bottom, 10) + 10 },
          ]}
        >
          <View style={styles.bookingHeader}>
            <View style={styles.metric}>
              <NativeAnimatedText
                value="SELECTED"
                size={10}
                weight="bold"
                color="#7f8b85"
                width={78}
              />
              <View style={styles.countRow}>
                <NativeAnimatedText
                  value={`${selectedCount}`}
                  size={30}
                  weight="black"
                  color="#f8fbf9"
                  animatedValue={selectedCount}
                  align="trailing"
                  width={38}
                />
                <NativeAnimatedText
                  value={selectedCount === 1 ? "seat" : "seats"}
                  size={15}
                  weight="bold"
                  color="#aab5af"
                  width={48}
                />
              </View>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.categoryMetric}>
              <NativeAnimatedText
                value="CATEGORY"
                size={10}
                weight="bold"
                color="#7f8b85"
                width={112}
              />
              <NativeAnimatedText
                value={selectedCategory}
                size={15}
                weight="bold"
                color={hasSelection ? "#c7f5d6" : "#929d97"}
                width={112}
              />
            </View>

            <View style={styles.totalMetric}>
              <NativeAnimatedText
                value="TOTAL"
                size={10}
                weight="bold"
                color="#7f8b85"
                align="trailing"
                width={104}
              />
              <NativeAnimatedText
                value={`$${selectedTotal.toFixed(2)}`}
                size={23}
                weight="black"
                color="#72e49a"
                animatedValue={totalCents}
                align="trailing"
                width={104}
              />
            </View>
          </View>

          <View style={styles.selectionStrip}>
            <View style={styles.seatLabel}>
              <Ionicons name="ticket-outline" size={17} color="#8fa29a" />
              <NativeAnimatedText
                value={selectedPreview}
                size={12}
                weight="bold"
                color={hasSelection ? "#e8eeeb" : "#77827c"}
                maxWidth={190}
              />
              {selectedOverflow > 0 && (
                <NativeAnimatedText
                  value={`+${selectedOverflow}`}
                  size={12}
                  weight="black"
                  color="#72e49a"
                  animatedValue={selectedOverflow}
                  width={34}
                />
              )}
            </View>
            {hasSelection && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear selected seats"
                hitSlop={8}
                onPress={clearSelection}
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed && styles.iconButtonPressed,
                ]}
              >
                <Ionicons name="close" size={18} color="#aab5af" />
              </Pressable>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to payment"
            disabled={!hasSelection}
            style={({ pressed }) => [
              styles.checkoutButton,
              !hasSelection && styles.checkoutButtonDisabled,
              pressed && hasSelection && styles.checkoutButtonPressed,
            ]}
          >
            <Ionicons
              name={hasSelection ? "card-outline" : "ticket-outline"}
              size={21}
              color={hasSelection ? "#102218" : "#69736e"}
            />
            <NativeAnimatedText
              value={hasSelection ? "Continue to payment" : "Select your seats"}
              size={16}
              weight="black"
              color={hasSelection ? "#102218" : "#69736e"}
              align="center"
              width={190}
            />
            <Ionicons
              name="arrow-forward"
              size={20}
              color={hasSelection ? "#102218" : "#69736e"}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0e0f12",
  },
  canvas: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "box-none",
  },
  iconButtonPressed: {
    opacity: 0.58,
  },
  bookingDock: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 0,
    paddingTop: 15,
    paddingHorizontal: 14,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(114,228,154,0.2)",
    backgroundColor: "rgba(12,15,14,0.94)",
    shadowColor: "#000000",
    shadowOpacity: 0.44,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
  },
  bookingHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
  },
  metric: {
    width: 92,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metricDivider: {
    width: 1,
    height: 38,
    marginRight: 13,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  categoryMetric: {
    flex: 1,
    minWidth: 100,
  },
  totalMetric: {
    alignItems: "flex-end",
  },
  selectionStrip: {
    minHeight: 38,
    marginTop: 10,
    paddingLeft: 11,
    paddingRight: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seatLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  clearButton: {
    width: 32,
    height: 32,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutButton: {
    height: 52,
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 15,
    backgroundColor: "#72e49a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkoutButtonDisabled: {
    backgroundColor: "#202522",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  checkoutButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});
