import { StyleSheet, View } from "react-native";
import Animated, {
  interpolateColor,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { CATS, S, TH } from "./constants";
import { BASE_Y, clamp01, isoX, isoY, smooth } from "./geometry";
import type { Building, CityLayout, MetricKey } from "./types";

const PILL_W = 64;
const CITY_LABEL_LANES: readonly (readonly [number, number])[] = [
  [0, 48], // City Hall
  [0, 70], // Immigration
  [0, 36], // DMV
  [0, 42], // Registry
  [0, 58], // Permits
  [0, 48], // Tax Office
];

function metricValue(cat: (typeof CATS)[number], metric: MetricKey) {
  if (metric === "volume") return cat.volumeMo;
  if (metric === "digital") return cat.digitalPercent;
  return cat.value;
}

function formatMetricValue(value: number, metric: MetricKey) {
  if (metric === "volume") {
    return value >= 1000
      ? `${(value / 1000).toFixed(1).replace(".0", "")}k`
      : `${value}`;
  }
  if (metric === "digital") return `${value}%`;
  return `${value}d`;
}

type TagProps = {
  b: Building;
  t: SharedValue<number>;
  activeMetric: MetricKey;
  nightOn: boolean;
  scale: number;
  isTallest: boolean;
  visibleHeights: SharedValue<number[]>;
};

function Tag({
  b,
  t,
  activeMetric,
  nightOn,
  scale,
  isTallest,
  visibleHeights,
}: TagProps) {
  const cat = CATS[b.catIndex];
  const valueLabel = formatMetricValue(metricValue(cat, activeMetric), activeMetric);

  /* precompute endpoints once (plain JS, captured by the worklets) */
  const ex = isoX(b.gx + 0.5, b.gy + 0.5);
  const lane = CITY_LABEL_LANES[b.catIndex] ?? [0, 44];
  const ny0 = BASE_Y + 20;
  const delay = b.labelDelay;

  const barValueStyle = useAnimatedStyle(() => {
    const pb = smooth(clamp01(t.value / 0.42));
    const h = visibleHeights.value[b.catIndex] ?? b.h;
    const x = b.barCenterX * scale;
    const y = (BASE_Y - h * S - 24) * scale;
    return {
      opacity: 1 - pb,
      transform: [{ translateX: x - 34 }, { translateY: y - 8 }],
      color: nightOn ? "#C9BFD2" : "#6B5F58",
    };
  });

  const pillStyle = useAnimatedStyle(() => {
    const pb = smooth(clamp01((t.value - delay * 0.45) / 0.55));
    const h = visibleHeights.value[b.catIndex] ?? b.h;
    const roofY = isoY(b.gx + 0.5, b.gy + 0.5, h) + TH;
    const ey = roofY - lane[1] - (isTallest ? 8 : 0);
    const vy0 = BASE_Y - h * S - 12;
    const x = (b.barCenterX + (ex - b.barCenterX) * pb) * scale;
    const y = (vy0 + (ey - vy0) * pb - Math.sin(pb * Math.PI) * 12) * scale;
    const settle = 0.88 + 0.12 * pb + 0.05 * Math.sin(pb * Math.PI);
    return {
      opacity: pb,
      transform: [
        { translateX: x - PILL_W / 2 },
        { translateY: y - 11 },
        { scale: settle },
      ],
      backgroundColor: nightOn
        ? "rgba(58,49,69,0.96)"
        : "rgba(255,255,255,0.96)",
    };
  });

  const valueStyle = useAnimatedStyle(() => {
    const pb = smooth(clamp01((t.value - delay * 0.45) / 0.55));
    return {
      color: interpolateColor(
        pb,
        [0, 1],
        [nightOn ? "#B9AFC5" : "#6B5F58", nightOn ? "#F0E8EE" : "#3D3230"],
      ),
    };
  });

  const connectorStyle = useAnimatedStyle(() => {
    const pb = smooth(clamp01((t.value - delay * 0.45) / 0.55));
    const h = visibleHeights.value[b.catIndex] ?? b.h;
    const roofY = isoY(b.gx + 0.5, b.gy + 0.5, h) + TH;
    const ey = roofY - lane[1] - (isTallest ? 8 : 0);
    const lineTop = (ey + 17) * scale;
    const lineHeight = Math.max(0, (roofY - ey - 23) * scale);
    return {
      opacity: pb,
      height: lineHeight,
      backgroundColor: cat.color,
      transform: [{ translateX: ex * scale - 1 }, { translateY: lineTop }],
    };
  });

  const roofDotStyle = useAnimatedStyle(() => {
    const pb = smooth(clamp01((t.value - delay * 0.45) / 0.55));
    const h = visibleHeights.value[b.catIndex] ?? b.h;
    const roofY = isoY(b.gx + 0.5, b.gy + 0.5, h) + TH;
    const pulse = 0.82 + 0.18 * pb + 0.1 * Math.sin(pb * Math.PI);
    return {
      opacity: pb,
      transform: [
        { translateX: ex * scale - 4 },
        { translateY: roofY * scale - 4 },
        { scale: pulse },
      ],
      backgroundColor: cat.color,
    };
  });

  const nameStyle = useAnimatedStyle(() => {
    const pb = smooth(clamp01(t.value / 0.42));
    const x = b.barCenterX * scale;
    const y = ny0 * scale;
    return {
      opacity: 1 - pb,
      transform: [
        { translateX: x - 50 },
        { translateY: y - 7 },
      ],
    };
  });

  return (
    <>
      <Animated.Text
        style={[
          styles.barValue,
          barValueStyle,
        ]}
      >
        {valueLabel}
      </Animated.Text>
      <Animated.View style={[styles.connector, connectorStyle]} />
      <Animated.View style={[styles.roofDotHalo, roofDotStyle]} />
      <Animated.View style={[styles.roofDot, roofDotStyle]} />
      <Animated.View style={[styles.pill, pillStyle]}>
        <Animated.View style={[styles.dot, { backgroundColor: cat.color }]} />
        <Animated.Text
          style={[
            styles.value,
            valueStyle,
          ]}
        >
          {valueLabel}
        </Animated.Text>
      </Animated.View>
      <Animated.Text
        style={[
          styles.name,
          nightOn && styles.nameNight,
          nameStyle,
        ]}
      >
        {cat.shortName}
      </Animated.Text>
    </>
  );
}

export function DataTags({
  t,
  layout,
  activeMetric,
  nightOn,
  scale,
  visibleHeights,
}: {
  t: SharedValue<number>;
  layout: CityLayout;
  activeMetric: MetricKey;
  nightOn: boolean;
  scale: number;
  visibleHeights: SharedValue<number[]>;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layout.buildings.map((b) => (
        <Tag
          key={b.catIndex}
          b={b}
          t={t}
          activeMetric={activeMetric}
          nightOn={nightOn}
          scale={scale}
          isTallest={b.catIndex === layout.tallestIndex}
          visibleHeights={visibleHeights}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    left: 0,
    top: 0,
    width: PILL_W,
    height: 22,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    shadowColor: "#140C1C",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  connector: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 2,
    borderRadius: 1,
  },
  roofDotHalo: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.18,
  },
  roofDot: {
    position: "absolute",
    left: 1.75,
    top: 1.75,
    width: 4.5,
    height: 4.5,
    borderRadius: 3,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  barValue: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 68,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    fontFamily: "ShareTechMono",
  },
  value: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    fontFamily: "ShareTechMono",
  },
  name: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 100,
    textAlign: "center",
    fontSize: 10,
    color: "#9A8F88",
    fontFamily: "ShareTechMono",
  },
  nameNight: {
    color: "#9C8FA6",
  },
});
