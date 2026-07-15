import { Circle, Group, Rect } from "@shopify/react-native-skia";
import {
  interpolateColor,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { STAR_POINTS } from "./constants";
export const SkyBackground = ({
  night,
  width,
  height,
}: {
  night: ReturnType<typeof useSharedValue<number>>;
  width: number;
  height: number;
}) => {
  const background = useDerivedValue(() =>
    interpolateColor(night.value, [0, 1], ["#FBF7F2", "#251E30"]),
  );
  const dayWarmth = useDerivedValue(() =>
    interpolateColor(
      night.value,
      [0, 1],
      ["rgba(245,237,225,0.56)", "rgba(37,30,48,0)"],
    ),
  );
  const sunOpacity = useDerivedValue(() => 0.5 * (1 - night.value));
  const starOpacity = useDerivedValue(() => night.value);

  return (
    <>
      <Rect x={0} y={0} width={width} height={height} color={background} />
      <Rect
        x={0}
        y={height * 0.35}
        width={width}
        height={height * 0.65}
        color={dayWarmth}
      />
      <Circle
        cx={width * 0.22}
        cy={height * 0.13}
        r={Math.max(width, height) * 0.18}
        color="rgba(255,246,224,0.42)"
        opacity={sunOpacity}
      />
      <Group opacity={starOpacity}>
        {STAR_POINTS.map((star: { x: number; y: number }) => (
          <Rect
            key={`${star.x}-${star.y}`}
            x={star.x * width}
            y={star.y * Math.min(height, 420) + 12}
            width={1.6}
            height={1.6}
            color="rgba(240,235,255,0.72)"
          />
        ))}
      </Group>
    </>
  );
};
