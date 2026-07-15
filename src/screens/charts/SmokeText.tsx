import {
  Canvas,
  Group,
  RoundedRect,
  Skia,
  Vertices,
} from "@shopify/react-native-skia";
import { useEffect } from "react";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const W = 360,
  H = 240;

export function SmokeTest() {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [t]);

  // 1) transform-based animation (cheapest path)
  const transform = useDerivedValue(() => [{ translateX: t.value * 200 }]);

  // 2) per-frame geometry via Vertices — the technique the city will use
  const vertices = useDerivedValue(() => {
    const y = 160 - t.value * 60;
    return [Skia.Point(60, 200), Skia.Point(120, 200), Skia.Point(90, y)];
  });

  return (
    <Canvas style={{ width: W, height: H }}>
      <Group transform={transform}>
        <RoundedRect
          x={20}
          y={40}
          width={40}
          height={40}
          r={8}
          color="#D96A9C"
        />
      </Group>
      <Vertices
        vertices={vertices}
        colors={["#7FB069", "#A8C69F", "#EFA8C8"]}
      />
    </Canvas>
  );
}
