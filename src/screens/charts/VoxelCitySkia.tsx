import {
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Rect,
  type SkPath,
  type SkPoint,
  vec,
  Vertices,
} from "@shopify/react-native-skia";
import type { DerivedValue, SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native";
import { BASE_Y, CHART_W, CHART_X } from "./geometry";
import { STAR_POINTS } from "./constants";

const CLOUDS = [
  { x: 0.13, y: 0.08, s: 0.82 },
  { x: 0.5, y: 0.055, s: 0.62 },
  { x: 0.78, y: 0.11, s: 0.94 },
];

type VoxelCitySkiaProps = {
  axisOpacity: SharedValue<number>;
  cityShadowAlpha: SharedValue<number>;
  cubeDayColors: string[];
  cubeIndices: number[];
  cubeNightColors: string[];
  cubeVertices: SharedValue<SkPoint[]>;
  groundDay: string[];
  groundIndices: number[];
  groundLayerAlpha: SharedValue<number>;
  groundNight: string[];
  groundVerts: SkPoint[];
  height: number;
  islandDay: string[];
  islandIndices: number[];
  islandNight: string[];
  islandVerts: SkPoint[];
  nightOn: boolean;
  offsetX: number;
  offsetY: number;
  revealClip: DerivedValue<SkPath>;
  riseTransform: DerivedValue<{ translateY: number }[]>;
  scale: number;
  shBottom: number;
  shLeft: number;
  shRight: number;
  shWidth: number;
  trailDayColors: string[];
  trailIndices: number[];
  trailNightColors: string[];
  trailVertices: SharedValue<SkPoint[]>;
  width: number;
};

export function VoxelCitySkia({
  axisOpacity,
  cityShadowAlpha,
  cubeDayColors,
  cubeIndices,
  cubeNightColors,
  cubeVertices,
  groundDay,
  groundIndices,
  groundLayerAlpha,
  groundNight,
  groundVerts,
  height,
  islandDay,
  islandIndices,
  islandNight,
  islandVerts,
  nightOn,
  offsetX,
  offsetY,
  revealClip,
  riseTransform,
  scale,
  shBottom,
  shLeft,
  shRight,
  shWidth,
  trailDayColors,
  trailIndices,
  trailNightColors,
  trailVertices,
  width,
}: VoxelCitySkiaProps) {
  const mode = nightOn ? "night" : "day";
  const sceneTransform = [
    { translateX: offsetX },
    { translateY: offsetY },
    { scale },
  ];

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={
            mode === "night" ? ["#251E30", "#2E2638"] : ["#FDFAF4", "#F5EDE1"]
          }
        />
      </Rect>
      {mode === "day" ? (
        <>
          <Rect
            x={0}
            y={height * 0.35}
            width={width}
            height={height * 0.65}
            color="rgba(245,237,225,0.56)"
          />
          <Circle
            cx={width * 0.22}
            cy={height * 0.13}
            r={Math.max(width, height) * 0.18}
            color="rgba(255,246,224,0.42)"
          />
          {CLOUDS.map((cloud, index) => {
            const cx = cloud.x * width;
            const cy = cloud.y * Math.min(height, 720);
            const s = cloud.s;

            return (
              <Group key={`cloud-${index}`} opacity={0.48}>
                <Oval
                  x={cx - 28 * s}
                  y={cy - 9 * s}
                  width={56 * s}
                  height={18 * s}
                  color="rgba(255,255,255,0.82)"
                />
                <Oval
                  x={cx + 2 * s}
                  y={cy - 4 * s}
                  width={40 * s}
                  height={15 * s}
                  color="rgba(255,255,255,0.72)"
                />
                <Oval
                  x={cx - 36 * s}
                  y={cy - 2 * s}
                  width={34 * s}
                  height={14 * s}
                  color="rgba(255,255,255,0.66)"
                />
              </Group>
            );
          })}
        </>
      ) : (
        <Group>
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
      )}

      <Group transform={sceneTransform}>
        <Oval
          x={(shLeft + shRight) / 2 - shWidth / 2}
          y={shBottom}
          width={shWidth}
          height={24}
          color={mode === "night" ? "rgba(5,4,10,1)" : "rgba(30,22,36,1)"}
          opacity={cityShadowAlpha}
        />
        <Group transform={riseTransform} clip={revealClip}>
          <Vertices
            vertices={islandVerts}
            colors={mode === "night" ? islandNight : islandDay}
            indices={islandIndices}
            opacity={groundLayerAlpha}
          />
          <Vertices
            vertices={groundVerts}
            colors={mode === "night" ? groundNight : groundDay}
            indices={groundIndices}
            opacity={groundLayerAlpha}
          />
        </Group>
        <Rect
          x={CHART_X - 18}
          y={BASE_Y}
          width={CHART_W + 36}
          height={2}
          color={mode === "night" ? "#4F445B" : "#D8CFC4"}
          opacity={axisOpacity}
        />
        <Vertices
          vertices={trailVertices}
          colors={mode === "night" ? trailNightColors : trailDayColors}
          indices={trailIndices}
          opacity={mode === "night" ? 0.3 : 0.26}
        />
        <Vertices
          vertices={cubeVertices}
          colors={mode === "night" ? cubeNightColors : cubeDayColors}
          indices={cubeIndices}
        />
      </Group>
    </Canvas>
  );
}
