import { SharedValue, useAnimatedStyle } from "react-native-reanimated";

const PARALLAX_MAX = 10;

export function useParallax(
  lightX: SharedValue<number>,
  lightY: SharedValue<number>,
  depth: number,
  invertX = false,
) {
  const xDir = invertX ? -1 : 1;
  return useAnimatedStyle(() => ({
    transform: [
      { translateX: lightX.value * depth * PARALLAX_MAX * xDir },
      { translateY: lightY.value * depth * PARALLAX_MAX },
    ],
  }));
}
