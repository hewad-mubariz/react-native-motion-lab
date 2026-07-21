import { useSalonSelectionScene } from "@/hooks/useSalonSelectionScene";
import { Host, Text as UIText } from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  contentTransition,
  font,
  foregroundStyle,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas } from "react-native-wgpu";

type NativeTextProps = {
  value: string;
  color?: string;
  size?: number;
  weight?: "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
  animatedValue?: number;
  align?: "center" | "leading" | "trailing";
  maxWidth?: number;
  width?: number;
  style?: StyleProp<ViewStyle>;
};

const NativeText = ({
  value,
  color = "#ffffff",
  size = 14,
  weight = "semibold",
  animatedValue,
  align = "leading",
  maxWidth,
  width,
  style,
}: NativeTextProps) => {
  const estimatedWidth = Math.min(
    maxWidth ?? 360,
    Math.max(22, Math.ceil(value.length * size * 0.64)),
  );
  const textHeight = Math.ceil(size * 1.32);

  return (
    <Host
      matchContents={false}
      style={[
        {
          width: width ?? maxWidth ?? estimatedWidth,
          height: textHeight,
          alignItems:
            align === "trailing"
              ? "flex-end"
              : align === "center"
                ? "center"
                : "flex-start",
          justifyContent: "center",
        },
        style,
      ]}
      colorScheme="dark"
    >
      <UIText
        modifiers={[
          font({ size, weight, design: "rounded" }),
          foregroundStyle(color),
          frame({ maxWidth, alignment: align }),
          ...(animatedValue === undefined
            ? []
            : [
                contentTransition("numericText"),
                animation(
                  Animation.spring({ response: 0.4, dampingFraction: 0.62 }),
                  animatedValue,
                ),
              ]),
        ]}
      >
        {value}
      </UIText>
    </Host>
  );
};

export const SalonSelectionScreen = () => {
  const insets = useSafeAreaInsets();
  const {
    canvasRef,
    handleLayout,
    handleTap,
    handleDragStart,
    handleDragUpdate,
    handlePinchStart,
    handlePinchUpdate,
    bookSelectedSeats,
    selectedCount,
    selectedSeats,
    selectedTotal,
  } = useSalonSelectionScene();
  const hasSelection = selectedCount > 0;
  const selectedPreview =
    selectedSeats.length === 0
      ? "Tap seats to build your row"
      : selectedSeats.slice(0, 6).join("  ");
  const selectedOverflow = Math.max(0, selectedSeats.length - 6);
  const totalCents = Math.round(selectedTotal * 100);

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .onStart(handleDragStart)
    .onUpdate((event) => {
      handleDragUpdate(event.translationX, event.translationY);
    });

  const tap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(180)
    .runOnJS(true)
    .onEnd((event) => {
      handleTap(event.x, event.y);
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(handlePinchStart)
    .onUpdate((event) => {
      handlePinchUpdate(event.scale);
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pan, pinch), tap);

  return (
    <View style={styles.screen} onLayout={handleLayout}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>
      <View pointerEvents="box-none" style={styles.overlay}>
        <View pointerEvents="none" style={[styles.legend, { top: insets.top + 12 }]}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.availableSwatch]} />
            <NativeText value="Available" size={12} weight="bold" color="#d8fffb" width={74} />
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.reservedSwatch]} />
            <NativeText value="Reserved" size={12} weight="bold" color="#ffd7cb" width={70} />
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, styles.selectedSwatch]} />
            <NativeText value="Selected" size={12} weight="bold" color="#ffe5a0" width={66} />
          </View>
        </View>

        <View style={[styles.bookingPanel, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.panelGlow} />
          <View style={styles.panelHeader}>
            <View>
              <NativeText value="Selected" size={13} color="#adffffff" />
              <View style={styles.selectedCountRow}>
                <NativeText
                  value={`${selectedCount}`}
                  size={34}
                  weight="black"
                  color="#ffffff"
                  animatedValue={selectedCount}
                  align="trailing"
                  width={42}
                />
                <NativeText
                  value="seat(s)"
                  size={34}
                  weight="black"
                  color="#ffffff"
                  width={128}
                />
              </View>
            </View>
            <View style={styles.totalBlock}>
              <NativeText value="Total" size={12} color="#9effffff" align="trailing" width={118} />
              <NativeText
                value={`$${selectedTotal.toFixed(2)}`}
                size={24}
                weight="black"
                color="#f6c95f"
                animatedValue={totalCents}
                align="trailing"
                width={118}
              />
            </View>
          </View>

          <View style={styles.seatStrip}>
            <NativeText
              value={selectedPreview}
              size={14}
              color="#c9fbf7"
              maxWidth={230}
              style={styles.previewText}
            />
            {selectedOverflow > 0 && (
              <NativeText
                value={`+${selectedOverflow}`}
                size={14}
                weight="black"
                color="#f6c95f"
                animatedValue={selectedOverflow}
                style={styles.overflowText}
              />
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book selected seats"
            disabled={!hasSelection}
            onPress={bookSelectedSeats}
            style={({ pressed }) => [
              styles.bookButton,
              !hasSelection && styles.bookButtonDisabled,
              pressed && hasSelection && styles.bookButtonPressed,
            ]}
          >
            <NativeText
              value={hasSelection ? "Book seats" : "Choose seats"}
              size={18}
              weight="black"
              color={hasSelection ? "#17140c" : "#80ffffff"}
              align="center"
              width={160}
              style={styles.bookText}
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
    backgroundColor: "#57574d",
  },
  canvas: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    pointerEvents: "box-none",
  },
  legend: {
    position: "absolute",
    right: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,19,17,0.72)",
    borderWidth: 1,
    borderColor: "rgba(201,251,247,0.2)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    gap: 6,
  },
  legendItem: {
    width: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendSwatch: {
    width: 11,
    height: 11,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.34)",
  },
  availableSwatch: {
    backgroundColor: "#86d7d2",
  },
  reservedSwatch: {
    backgroundColor: "#e98773",
  },
  selectedSwatch: {
    backgroundColor: "#e5b45b",
  },
  bookingPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(246,201,95,0.26)",
    backgroundColor: "rgba(17,19,17,0.86)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -12 },
  },
  panelGlow: {
    position: "absolute",
    left: 24,
    right: 24,
    top: -42,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(246,201,95,0.16)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
  },
  selectedCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  totalBlock: {
    minWidth: 118,
    alignItems: "flex-end",
    paddingTop: 3,
  },
  seatStrip: {
    minHeight: 34,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(134,215,210,0.18)",
    backgroundColor: "rgba(134,215,210,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  previewText: {
    flexShrink: 1,
  },
  overflowText: {
    minWidth: 32,
    alignItems: "flex-end",
  },
  bookButton: {
    height: 54,
    marginTop: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6c95f",
    shadowColor: "#f6c95f",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  bookButtonPressed: {
    transform: [{ translateY: 1 }, { scale: 0.99 }],
    shadowOpacity: 0.18,
  },
  bookButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.12)",
    shadowOpacity: 0,
  },
  bookText: {
    alignItems: "center",
    justifyContent: "center",
  },
});
