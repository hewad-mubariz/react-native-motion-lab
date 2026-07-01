import { FURNITURE_PRODUCTS } from "@/constants/furniture-products";
import { useFurnitureScene } from "@/hooks/useFurnitureScene";
import { preloadGlbMesh } from "@/scenes/furniture-showcase/glb";
import { resolveFurnitureModelUri } from "@/utils/furniture-assets";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas } from "react-native-wgpu";

interface PaginationDotProps {
  active: boolean;
  onPress: () => void;
}

const PaginationDot = ({ active, onPress }: PaginationDotProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(active ? 26 : 8, { duration: 220 }),
      opacity: withTiming(active ? 1 : 0.42, { duration: 180 }),
      transform: [
        {
          scale: withTiming(active ? 1 : 0.86, { duration: 180 }),
        },
      ],
    };
  }, [active]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? "Current product" : "Open product"}
      onPress={onPress}
      style={styles.dotHitArea}
    >
      <Animated.View
        style={[
          styles.dot,
          active ? styles.dotSelected : styles.dotIdle,
          animatedStyle,
        ]}
      />
    </Pressable>
  );
};

export const FurnitureShowcaseScreen = () => {
  const insets = useSafeAreaInsets();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedProduct = FURNITURE_PRODUCTS[selectedIndex];
  const {
    canvasRef,
    modelError,
    modelLoading,
    handlePanStart,
    handlePanUpdate,
    handlePinchStart,
    handlePinchUpdate,
  } = useFurnitureScene({ model: selectedProduct.model });

  const pan = Gesture.Pan()
    .runOnJS(true)
    .onStart(handlePanStart)
    .onUpdate((event) => {
      handlePanUpdate(event.translationX, event.translationY);
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(handlePinchStart)
    .onUpdate((event) => {
      handlePinchUpdate(event.scale);
    });

  const gesture = Gesture.Simultaneous(pan, pinch);
  const pageCount = FURNITURE_PRODUCTS.length;

  useEffect(() => {
    let cancelled = false;

    const warmModels = async () => {
      const rest = FURNITURE_PRODUCTS.filter(
        (product) => product.id !== selectedProduct.id,
      );

      for (const product of rest) {
        if (cancelled) return;

        try {
          const uri = await resolveFurnitureModelUri(product.model);
          preloadGlbMesh(uri);
        } catch {
          // Keep demo preload quiet; selecting the model will surface errors.
        }
      }
    };

    void warmModels();

    return () => {
      cancelled = true;
    };
  }, [selectedProduct.id]);

  const goToPrevious = () => {
    setSelectedIndex((index) => (index - 1 + pageCount) % pageCount);
  };

  const goToNext = () => {
    setSelectedIndex((index) => (index + 1) % pageCount);
  };

  return (
    <View style={styles.screen}>
      <GestureDetector gesture={gesture}>
        <Canvas ref={canvasRef} style={styles.canvas} />
      </GestureDetector>
      {modelLoading || modelError ? (
        <View pointerEvents="none" style={styles.loading}>
          {!modelError ? (
            <ActivityIndicator color="rgba(8,10,16,0.62)" />
          ) : null}
          <Text style={styles.loadingText}>
            {modelError ? "Model failed" : "Loading model"}
          </Text>
        </View>
      ) : null}

      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.galleryRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous furniture model"
            onPress={goToPrevious}
            style={({ pressed }) => [
              styles.arrowButton,
              pressed && styles.arrowButtonPressed,
            ]}
          >
            <Ionicons name="chevron-back" size={24} color="rgba(8,10,16,0.72)" />
          </Pressable>

          <View style={styles.paginationWrap}>
            <View
              accessibilityRole="adjustable"
              accessibilityLabel={`${selectedProduct.name}, ${selectedIndex + 1} of ${pageCount}`}
              style={styles.pagination}
            >
              {FURNITURE_PRODUCTS.map((product, index) => (
                <PaginationDot
                  key={product.id}
                  active={index === selectedIndex}
                  onPress={() => setSelectedIndex(index)}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next furniture model"
            onPress={goToNext}
            style={({ pressed }) => [
              styles.arrowButton,
              pressed && styles.arrowButtonPressed,
            ]}
          >
            <Ionicons name="chevron-forward" size={24} color="rgba(8,10,16,0.72)" />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#bbbbbb",
  },
  canvas: {
    flex: 1,
  },
  loading: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#bbbbbb",
  },
  loadingText: {
    color: "rgba(8,10,16,0.58)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(8,10,16,0.12)",
    paddingTop: 14,
  },
  galleryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  arrowButton: {
    width: 42,
    height: 50,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,10,16,0.06)",
  },
  arrowButtonPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
  paginationWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  dotHitArea: {
    width: 34,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotIdle: {
    backgroundColor: "rgba(8,10,16,0.18)",
  },
  dotSelected: {
    backgroundColor: "rgba(8,10,16,0.58)",
  },
});
