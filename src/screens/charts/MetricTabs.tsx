import { memo, useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { haptics } from "@/utils/haptics";
import { METRICS } from "./constants";
import type { MetricKey } from "./types";

const TAB_PADDING = 5;
const TAB_GAP = 4;

const METRIC_INDEX: Record<MetricKey, number> = {
  wait: 0,
  volume: 1,
  digital: 2,
};

const ACCENTS: Record<MetricKey, string> = {
  wait: "#D96A9C",
  volume: "#7FB069",
  digital: "#A8C69F",
};

type MetricTabsProps = {
  activeMetric: MetricKey;
  nightOn?: boolean;
  onChange: (metric: MetricKey) => void;
};

type MetricTabProps = {
  index: number;
  metric: (typeof METRICS)[number];
  active: SharedValue<number>;
  selected: boolean;
  nightOn: boolean;
  tabWidth: number;
  onPress: () => void;
};
const MetricTab = memo(function MetricTab({
  index,
  metric,
  active,
  selected,
  nightOn,
  tabWidth,
  onPress,
}: MetricTabProps) {
  const tabMotionStyle = useAnimatedStyle(() => {
    const distance = Math.abs(active.value - index);
    return {
      opacity: interpolate(distance, [0, 1], [1, 0.72], Extrapolation.CLAMP),
      transform: [
        {
          scale: interpolate(distance, [0, 1], [1, 0.97], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        { width: tabWidth || undefined },
        pressed && styles.tabPressed,
      ]}
    >
      <Animated.View
        style={[
          styles.tabInner,
          tabMotionStyle,
        ]}
      >
        <View
          style={[
            styles.dot,
            { backgroundColor: ACCENTS[metric.key] },
            selected ? styles.dotSelected : styles.dotInactive,
          ]}
        />
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            styles.labelMono,
            nightOn
              ? selected
                ? styles.labelSelectedNight
                : styles.labelInactiveNight
              : selected
                ? styles.labelSelectedDay
                : styles.labelInactiveDay,
          ]}
        >
          {metric.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

export function MetricTabs({
  activeMetric,
  nightOn = false,
  onChange,
}: MetricTabsProps) {
  const [width, setWidth] = useState(0);
  const active = useSharedValue(METRIC_INDEX[activeMetric]);
  const tabWidth =
    width > 0
      ? (width - TAB_PADDING * 2 - TAB_GAP * (METRICS.length - 1)) /
        METRICS.length
      : 0;

  useEffect(() => {
    active.value = withSpring(METRIC_INDEX[activeMetric], {
      damping: 22,
      stiffness: 260,
      mass: 0.7,
    });
  }, [active, activeMetric]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: width > 0 ? 1 : 0,
    width: tabWidth,
    transform: [
      {
        translateX: TAB_PADDING + active.value * (tabWidth + TAB_GAP),
      },
    ],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) > 0.5 ? nextWidth : currentWidth,
    );
  };

  const handlePress = (metric: MetricKey) => {
    if (metric === activeMetric) return;
    haptics.tab();
    onChange(metric);
  };

  return (
    <Animated.View
      style={[styles.shell, nightOn ? styles.shellNight : styles.shellDay]}
      onLayout={handleLayout}
    >
      <Animated.View
        style={[
          styles.indicator,
          nightOn ? styles.indicatorNight : styles.indicatorDay,
          indicatorStyle,
        ]}
      />
      {METRICS.map((metric, index) => (
        <MetricTab
          key={metric.key}
          index={index}
          metric={metric}
          active={active}
          selected={activeMetric === metric.key}
          nightOn={nightOn}
          tabWidth={tabWidth}
          onPress={() => handlePress(metric.key)}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 108,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    padding: TAB_PADDING,
    flexDirection: "row",
    gap: TAB_GAP,
    shadowColor: "#140C1C",
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  shellDay: {
    backgroundColor: "#EEE7DD",
    borderColor: "rgba(61,50,48,0.07)",
  },
  shellNight: {
    backgroundColor: "#3A3145",
    borderColor: "rgba(240,232,238,0.08)",
  },
  indicator: {
    position: "absolute",
    top: TAB_PADDING,
    bottom: TAB_PADDING,
    left: 0,
    borderRadius: 11,
    shadowColor: "#140C1C",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  indicatorDay: {
    backgroundColor: "#FFFDFC",
  },
  indicatorNight: {
    backgroundColor: "#4A4056",
  },
  tab: {
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tabPressed: {
    transform: [{ scale: 0.985 }],
  },
  tabInner: {
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 3,
  },
  dotSelected: {
    opacity: 1,
    transform: [{ scale: 1.12 }],
  },
  dotInactive: {
    opacity: 0.42,
    transform: [{ scale: 0.82 }],
  },
  label: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  labelMono: {
    fontFamily: "ShareTechMono",
  },
  labelSelectedDay: {
    color: "#3D3230",
  },
  labelInactiveDay: {
    color: "#8C8078",
  },
  labelSelectedNight: {
    color: "#F0E8EE",
  },
  labelInactiveNight: {
    color: "#A79BB0",
  },
});
