import { haptics } from "@/utils/haptics";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas as WGPUCanvas } from "react-native-wgpu";
import { CATS, METRICS, MORPH_MS, TH } from "./constants";
import {
  buildLayout,
  getBuildingProjectedBounds,
  getBuildingRoofBounds,
  heightsForMetric,
  isoX,
  isoY,
  updateMetricHeights,
  VH,
  VW,
} from "./geometry";
import { useChartGpuScene } from "./gpu/useChartGpuScene";
import { MetricTabs } from "./MetricTabs";
import { DataTags } from "./Tag";
import type { MetricKey } from "./types";

const NIGHT_WAVE_MS = 850;
const METRIC_KEYS: MetricKey[] = ["wait", "volume", "digital"];
const METRIC_MORPH_MS = 1200;

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

function metricSummary(metric: MetricKey) {
  if (metric === "volume") {
    const total = CATS.reduce((sum, cat) => sum + cat.volumeMo, 0);
    return `total ${formatMetricValue(total, metric)}/mo`;
  }

  const values = CATS.map((cat) => metricValue(cat, metric));
  const avg = Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
  return `avg ${formatMetricValue(avg, metric)}`;
}

function trendValues(cat: (typeof CATS)[number], metric: MetricKey) {
  const now = metricValue(cat, metric);
  const start = now / (1 + cat.trendPercent / 100);
  return [0, 1, 2, 3].map((step) => start + ((now - start) * step) / 3);
}

export const VoxelCityChart = () => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = Math.min(width / VW, height / VH) * 1.32;
  const offsetX = (width - VW * scale) / 2;
  const offsetY = (height - VH * scale) / 2;

  const t = useSharedValue(0); // 0 = bar chart, 1 = city
  const night = useSharedValue(0); // 0 = day, 1 = night
  const metricT = useSharedValue(1);
  const fromHeights = useSharedValue(heightsForMetric("wait"));
  const toHeights = useSharedValue(heightsForMetric("wait"));
  const visibleHeights = useSharedValue(heightsForMetric("wait"));
  const [activeMetric, setActiveMetric] = useState<MetricKey>("wait");
  const [nightOn, setNightOn] = useState(false);
  const [cityBuilt, setCityBuilt] = useState(false);
  const [selectedCatIndex, setSelectedCatIndex] = useState<number | null>(null);
  const [detailCatIndex, setDetailCatIndex] = useState<number | null>(null);
  const {
    canvasRef: gpuCanvasRef,
    handleLayout: handleGpuLayout,
  } = useChartGpuScene({
    activeMetric,
    cityBuilt,
    enabled: true,
    nightOn,
    selectedCatIndex,
  });

  /* =====================================================================
     BUILD-ONCE SECTION
     Everything in these useMemos runs exactly once per layout. Nothing
     here is allowed in the per-frame path.
     ===================================================================== */
  const layouts = useMemo(
    () =>
      Object.fromEntries(
        METRIC_KEYS.map((metric) => [metric, buildLayout(metric)]),
      ) as Record<MetricKey, ReturnType<typeof buildLayout>>,
    [],
  );
  const maxHeights = useMemo(
    () =>
      CATS.map((_, i) =>
        Math.max(...METRIC_KEYS.map((metric) => layouts[metric].heights[i])),
      ),
    [layouts],
  );
  const layout = useMemo(() => buildLayout("wait", maxHeights), [maxHeights]);

  /* =====================================================================
     PER-FRAME DERIVATIONS
     ===================================================================== */

  const iconMoonOpacity = useDerivedValue(() => 1 - night.value);
  const iconSunOpacity = useDerivedValue(() => night.value);
  const iconScale = useDerivedValue(
    () => 0.92 + 0.08 * Math.sin(night.value * Math.PI),
  );
  const moonStyle = useAnimatedStyle(() => ({
    opacity: iconMoonOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  const sunStyle = useAnimatedStyle(() => ({
    opacity: iconSunOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  useAnimatedReaction(
    () => ({
      metricProgress: metricT.value,
    }),
    ({ metricProgress }) => {
      const heights = visibleHeights.value;
      updateMetricHeights(
        heights,
        fromHeights.value,
        toHeights.value,
        metricProgress,
      );
      visibleHeights.value = heights.slice();
    },
  );

  const controlStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      night.value,
      [0, 1],
      ["#F1EAE0", "#3A3145"],
    ),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    color: interpolateColor(night.value, [0, 1], ["#3D3230", "#F0E8EE"]),
  }));
  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      night.value,
      [0, 1],
      ["#F1EAE0", "#3A3145"],
    ),
  }));
  const chipTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(night.value, [0, 1], ["#6F655F", "#B9AFC5"]),
  }));
  const actionStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      night.value,
      [0, 1],
      ["#3D3230", "#F0E8EE"],
    ),
  }));
  const actionTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(night.value, [0, 1], ["#FBF7F2", "#2B2333"]),
  }));
  const detailProgress = useSharedValue(0);
  const detailAnimatedStyle = useAnimatedStyle(() => {
    const p = detailProgress.value;

    return {
      opacity: p,
      transform: [
        { translateY: (1 - p) * 8 },
        { scale: 0.94 + p * 0.06 },
      ],
    };
  });

  /* =====================================================================
     INTERACTIONS
  ===================================================================== */
  const hideDetail = () => {
    setSelectedCatIndex(null);
    detailProgress.value = withTiming(
      0,
      {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(setDetailCatIndex)(null);
        }
      },
    );
  };

  const showDetail = (catIndex: number) => {
    setDetailCatIndex(catIndex);
    setSelectedCatIndex(catIndex);
    detailProgress.value = 0;
    detailProgress.value = withSpring(1, {
      damping: 8,
      stiffness: 180,
      mass: 0.55,
    });
  };

  const toggle = () => {
    const nextBuilt = !cityBuilt;
    if (nextBuilt) {
      haptics.build();
    } else {
      haptics.flatten();
      hideDetail();
    }
    setCityBuilt(nextBuilt);
    t.value = withTiming(nextBuilt ? 1 : 0, {
      duration: MORPH_MS,
      easing: Easing.linear,
    });
  };

  const handleMetricChange = (metric: MetricKey) => {
    if (metric === activeMetric) return;

    fromHeights.value = visibleHeights.value.slice();
    toHeights.value = heightsForMetric(metric);
    setActiveMetric(metric);
    metricT.value = 0;
    metricT.value = withTiming(1, {
      duration: METRIC_MORPH_MS,
      easing: Easing.linear,
    });
  };

  const handleBuildingPress = (catIndex: number) => {
    if (!cityBuilt) return;

    haptics.selection();
    if (selectedCatIndex === catIndex) {
      hideDetail();
      return;
    }

    showDetail(catIndex);
  };

  const toggleNight = () => {
    const nextNight = !nightOn;
    haptics.toggle();
    setNightOn(nextNight);
    night.value = withTiming(nextNight ? 1 : 0, {
      duration: NIGHT_WAVE_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  };

  const activeMetricInfo =
    METRICS.find((metric) => metric.key === activeMetric) ?? METRICS[0];
  const activeHeights = layouts[activeMetric].heights;
  const selectedCat =
    detailCatIndex === null ? null : (CATS[detailCatIndex] ?? null);
  const selectedBuilding =
    detailCatIndex === null
      ? null
      : (layout.buildings.find((b) => b.catIndex === detailCatIndex) ?? null);
  const selectedValue =
    selectedCat === null ? 0 : metricValue(selectedCat, activeMetric);
  const selectedRank =
    selectedCat === null
      ? 0
      : 1 +
        CATS.filter((cat) => metricValue(cat, activeMetric) > selectedValue)
          .length;
  const selectedTrend =
    selectedCat === null ? [] : trendValues(selectedCat, activeMetric);
  const selectedTrendMax = selectedTrend.length
    ? Math.max(...selectedTrend)
    : 1;
  const selectedTrendMin = selectedTrend.length
    ? Math.min(...selectedTrend) * 0.985
    : 0;
  const cardWidth = 214;
  const cardHeight = 110;
  const cardGap = 14;
  const selectedCardStyle = useMemo(() => {
    if (!selectedCat || !selectedBuilding) return null;

    const currentHeight =
      activeHeights[selectedBuilding.catIndex] ?? selectedBuilding.h;
    const roof = getBuildingRoofBounds(selectedBuilding, currentHeight);
    const body = getBuildingProjectedBounds(selectedBuilding, currentHeight);
    const screenRoof = {
      minY: offsetY + roof.minY * scale,
      centerX: offsetX + roof.centerX * scale,
      centerY: offsetY + roof.centerY * scale,
    };
    const screenBody = {
      minX: offsetX + body.minX * scale,
      maxX: offsetX + body.maxX * scale,
    };
    const inset = 12;
    const topGuard = 132;
    const bottomGuard = height - (insets.bottom + 156);
    const clampLeft = (value: number) =>
      Math.min(Math.max(inset, value), width - cardWidth - inset);
    const clampTop = (value: number) =>
      Math.min(
        Math.max(topGuard, value),
        Math.max(topGuard, bottomGuard - cardHeight),
      );
    const aboveTop = screenRoof.minY - cardHeight - cardGap;

    if (aboveTop >= topGuard) {
      return {
        left: clampLeft(screenRoof.centerX - cardWidth / 2),
        top: aboveTop,
      };
    }

    const preferRight = screenRoof.centerX < width / 2;
    const rightLeft = screenBody.maxX + cardGap;
    const leftLeft = screenBody.minX - cardWidth - cardGap;
    const sideLeft =
      preferRight && rightLeft + cardWidth <= width - inset
        ? rightLeft
        : !preferRight && leftLeft >= inset
          ? leftLeft
          : rightLeft + cardWidth <= width - inset
            ? rightLeft
            : leftLeft >= inset
              ? leftLeft
              : screenRoof.centerX - cardWidth / 2;

    return {
      left: clampLeft(sideLeft),
      top: clampTop(screenRoof.centerY - cardHeight / 2),
    };
  }, [
    activeHeights,
    cardGap,
    cardHeight,
    cardWidth,
    height,
    insets.bottom,
    offsetX,
    offsetY,
    scale,
    selectedBuilding,
    selectedCat,
    width,
  ]);

  /* =====================================================================
     RENDER
     Draw order = painter's order:
     sky → island shadow → island → ground → axis → cubes → windows
     ===================================================================== */
  return (
    <View style={styles.screen}>
      <View style={styles.stage} onLayout={handleGpuLayout}>
        <WGPUCanvas ref={gpuCanvasRef} style={StyleSheet.absoluteFill} />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [{ translateX: offsetX }, { translateY: offsetY }],
            },
          ]}
        >
          <DataTags
            t={t}
            layout={layout}
            activeMetric={activeMetric}
            nightOn={nightOn}
            scale={scale}
            visibleHeights={visibleHeights}
          />
        </View>
        <View
          collapsable={false}
          pointerEvents={cityBuilt ? "box-none" : "none"}
          style={[
            StyleSheet.absoluteFill,
            styles.buildingHitLayer,
            {
              transform: [{ translateX: offsetX }, { translateY: offsetY }],
            },
          ]}
        >
          {layout.buildings.map((building) => {
            const h = activeHeights[building.catIndex] ?? building.h;
            const roofY = isoY(building.gx + 0.5, building.gy + 0.5, h) + TH;
            const baseY = isoY(building.gx + 0.5, building.gy + 0.5, 0) + TH;
            const x = isoX(building.gx + 0.5, building.gy + 0.5) * scale;
            const y = roofY * scale;
            const hitHeight = Math.max(76, (baseY - roofY) * scale + 58);

            return (
              <Pressable
                key={building.catIndex}
                collapsable={false}
                accessibilityRole="button"
                accessibilityLabel={`Bounce ${CATS[building.catIndex].name}`}
                hitSlop={8}
                onPressIn={() => handleBuildingPress(building.catIndex)}
                style={[
                  styles.buildingHitTarget,
                  {
                    height: hitHeight,
                    left: x - 46,
                    top: y - 34,
                    width: 92,
                  },
                ]}
              />
            );
          })}
        </View>
        {selectedCat && selectedCardStyle ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.detailCard,
              nightOn ? styles.detailCardNight : styles.detailCardDay,
              selectedCardStyle,
              detailAnimatedStyle,
            ]}
          >
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleRow}>
                <View
                  style={[
                    styles.detailDot,
                    { backgroundColor: selectedCat.color },
                  ]}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.detailTitle,
                    nightOn ? styles.detailTextNight : styles.detailTextDay,
                  ]}
                >
                  {selectedCat.shortName.toLowerCase()}
                </Text>
              </View>
              <Text
                style={[
                  styles.detailValue,
                  nightOn ? styles.detailTextNight : styles.detailTextDay,
                ]}
              >
                {formatMetricValue(selectedValue, activeMetric)}
              </Text>
            </View>
            <View style={styles.detailMetaRow}>
              <Text
                style={[
                  styles.detailMeta,
                  nightOn ? styles.detailMetaNight : styles.detailMetaDay,
                ]}
              >
                rank {selectedRank} of {CATS.length}
              </Text>
              <Text
                style={[
                  styles.detailMeta,
                  nightOn ? styles.detailMetaNight : styles.detailMetaDay,
                ]}
              >
                {metricSummary(activeMetric)}
              </Text>
            </View>
            <View style={styles.detailBars}>
              {selectedTrend.map((value, index) => {
                const barHeight =
                  8 +
                  ((value - selectedTrendMin) /
                    Math.max(1, selectedTrendMax - selectedTrendMin)) *
                    26;

                return (
                  <View key={index} style={styles.detailBarSlot}>
                    <View
                      style={[
                        styles.detailBar,
                        {
                          backgroundColor: selectedCat.color,
                          height: barHeight,
                          opacity:
                            index === selectedTrend.length - 1 ? 1 : 0.58,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.detailBarLabel,
                        nightOn ? styles.detailMetaNight : styles.detailMetaDay,
                      ]}
                    >
                      {["-3", "-2", "-1", "now"][index]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.header}>
        <Animated.Text style={[styles.title, titleStyle]}>
          The <Text style={styles.titleAccent}>bureaucracy</Text> skyline
        </Animated.Text>

        <Animated.View style={[styles.nightButton, controlStyle]}>
          <Pressable
            accessibilityLabel="Toggle night mode"
            hitSlop={10}
            onPress={toggleNight}
            style={styles.nightPressable}
          >
            <Animated.View style={[styles.iconLayer, moonStyle]}>
              <Ionicons name="moon" size={20} color="#3D3230" />
            </Animated.View>
            <Animated.View style={[styles.iconLayer, sunStyle]}>
              <Ionicons name="sunny" size={20} color="#F0E8EE" />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </View>

      <MetricTabs
        activeMetric={activeMetric}
        nightOn={nightOn}
        onChange={handleMetricChange}
      />

      <View style={[styles.controls, { bottom: insets.bottom + 20 }]}>
        <Animated.Text style={[styles.metricHint, chipTextStyle]}>
          {activeMetricInfo.label.toLowerCase()} · {activeMetricInfo.hint}
        </Animated.Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.legendContent}
        >
          {CATS.map((cat) => (
            <Animated.View
              key={cat.name}
              style={[styles.legendChip, chipStyle]}
            >
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: nightOn ? cat.darkColor : cat.color },
                ]}
              />
              <Animated.Text
                numberOfLines={1}
                style={[styles.legendText, chipTextStyle]}
              >
                {cat.shortName.toLowerCase()} ·{" "}
                {formatMetricValue(
                  metricValue(cat, activeMetric),
                  activeMetric,
                )}
              </Animated.Text>
            </Animated.View>
          ))}
        </ScrollView>

        <Animated.View style={[styles.actionButton, actionStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cityBuilt ? "Flatten chart" : "Build the city"}
            onPress={toggle}
            style={({ pressed }) => [
              styles.actionPressable,
              pressed && styles.actionPressed,
            ]}
          >
            <Animated.Text style={[styles.actionText, actionTextStyle]}>
              {cityBuilt ? "Flatten" : "Build the city"}
            </Animated.Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FBF7F2" },
  stage: { flex: 1 },
  buildingHitLayer: {
    zIndex: 20,
    elevation: 20,
  },
  buildingHitTarget: {
    position: "absolute",
    zIndex: 21,
    elevation: 21,
    backgroundColor: "rgba(255,255,255,0.001)",
  },
  detailCard: {
    position: "absolute",
    zIndex: 30,
    elevation: 30,
    width: 214,
    height: 110,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: "#140C1C",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  detailCardDay: {
    backgroundColor: "rgba(255,255,255,0.98)",
  },
  detailCardNight: {
    backgroundColor: "rgba(58,49,69,0.98)",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailTitleRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  detailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailTitle: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "ShareTechMono",
  },
  detailValue: {
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    fontFamily: "ShareTechMono",
  },
  detailTextDay: {
    color: "#3D3230",
  },
  detailTextNight: {
    color: "#F0E8EE",
  },
  detailMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  detailMeta: {
    fontSize: 10,
    fontWeight: "600",
    fontFamily: "ShareTechMono",
  },
  detailMetaDay: {
    color: "#9A8F88",
  },
  detailMetaNight: {
    color: "#B9AFC5",
  },
  detailBars: {
    height: 36,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  detailBarSlot: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  detailBar: {
    width: "72%",
    minHeight: 3,
    borderRadius: 3,
  },
  detailBarLabel: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: "600",
    fontFamily: "ShareTechMono",
  },
  header: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 56,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0,
    fontFamily: "ShareTechMono",
  },
  titleAccent: {
    color: "#D96A9C",
  },
  nightButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    shadowColor: "#140C1C",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  nightPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    position: "absolute",
  },
  controls: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 26,
    gap: 10,
    zIndex: 40,
    elevation: 40,
  },
  metricHint: {
    alignSelf: "center",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0,
    fontFamily: "ShareTechMono",
  },
  legendContent: {
    gap: 8,
    paddingRight: 2,
  },
  legendChip: {
    height: 28,
    borderRadius: 14,
    paddingLeft: 9,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    fontFamily: "ShareTechMono",
  },
  actionButton: {
    height: 48,
    borderRadius: 16,
    overflow: "hidden",
  },
  actionPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPressed: {
    transform: [{ scale: 0.985 }],
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    fontFamily: "ShareTechMono",
  },
});
