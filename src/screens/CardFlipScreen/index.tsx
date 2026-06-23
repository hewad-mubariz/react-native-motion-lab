import { useFonts } from "expo-font";
import { DeviceMotion } from "expo-sensors";
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { BackContent } from "./BackContent";
import { FaceShader } from "./FaceShader";
import { FrontContent } from "./FrontContent";
import { CARD_NUMBER_FONT_FAMILY, CARD_REFRACTION, CARD_SHIMMER } from "./constants";
import { styles } from "./styles";

const GYRO_RANGE_X_DEG = 32;
const GYRO_RANGE_Y_DEG = 26;
const MOTION_SMOOTHING = 0.16;
const TILT_X_DEG = 8; // max rotateX from forward/back tilt
const TILT_Y_DEG = 5; // max rotateY overlay from left/right tilt

const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));
const radToDeg = (value: number) => (value * 180) / Math.PI;

function applyMotionFeel(value: number) {
  "worklet";
  const sign = value < 0 ? -1 : 1;
  return sign * Math.pow(Math.min(1, Math.abs(value)), 0.82);
}

function CardFace({
  rotY,
  offset,
  absolute,
  lightX,
  lightY,
  children,
}: {
  rotY: SharedValue<number>;
  offset: number;
  absolute?: boolean;
  lightX: SharedValue<number>;
  lightY: SharedValue<number>;
  children: React.ReactNode;
}) {
  const animStyle = useAnimatedStyle(() => ({
    ...(absolute ? { position: "absolute" as const, top: 0, left: 0 } : {}),
    transform: [
      { perspective: 900 },
      { rotateX: `${lightY.value * TILT_X_DEG}deg` },
      { rotateY: `${rotY.value + offset + lightX.value * TILT_Y_DEG}deg` },
    ],
    backfaceVisibility: "hidden" as const,
  }));
  return <Animated.View style={[styles.cardFace, animStyle]}>{children}</Animated.View>;
}

export function CardFlipScreen() {
  const [fontsLoaded] = useFonts({
    [CARD_NUMBER_FONT_FAMILY]: require("../../../assets/fonts/ShareTechMono-Regular.ttf"),
  });

  const rotY = useSharedValue(0);
  const clock = useSharedValue(0);
  const flipped = useSharedValue(false);
  const startRot = useSharedValue(0);
  const refraction = useSharedValue(CARD_REFRACTION);
  const shimmer = useSharedValue(CARD_SHIMMER);
  const lightX = useSharedValue(0);
  const lightY = useSharedValue(0);
  const rawLightX = useSharedValue(0);
  const rawLightY = useSharedValue(0);

  useEffect(() => {
    clock.value = withRepeat(
      withTiming(3600, { duration: 3_600_000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [clock]);

  useEffect(() => {
    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    let restingBeta: number | undefined;

    const startMotion = async () => {
      try {
        const available = await DeviceMotion.isAvailableAsync();
        if (!available || cancelled) return;

        const permission = await DeviceMotion.requestPermissionsAsync();
        if (!permission.granted || cancelled) return;

        DeviceMotion.setUpdateInterval(16);
        subscription = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;

          const gamma = rotation.gamma ?? 0;
          const beta = rotation.beta ?? 0;
          restingBeta ??= beta;

          rawLightX.value = clampUnit(radToDeg(gamma) / GYRO_RANGE_X_DEG);
          rawLightY.value = clampUnit(radToDeg(beta - restingBeta) / GYRO_RANGE_Y_DEG);
        });
      } catch {
        rawLightX.value = 0;
        rawLightY.value = 0;
      }
    };

    startMotion();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [rawLightX, rawLightY]);

  useFrameCallback(() => {
    "worklet";
    const nextX = lightX.value + (rawLightX.value - lightX.value) * MOTION_SMOOTHING;
    const nextY = lightY.value + (rawLightY.value - lightY.value) * MOTION_SMOOTHING;

    lightX.value = applyMotionFeel(nextX);
    lightY.value = applyMotionFeel(nextY);
  });

  const flipAbs = useDerivedValue(() =>
    Math.abs(Math.sin((rotY.value * Math.PI) / 180)),
  );

  const dragGesture = Gesture.Pan()
    .minDistance(10)
    .onBegin(() => {
      "worklet";
      startRot.value = rotY.value;
    })
    .onUpdate((e) => {
      "worklet";
      rotY.value = startRot.value + e.translationX * 0.5;
    })
    .onEnd((e) => {
      "worklet";
      const snapped = Math.round(rotY.value / 180) * 180;
      const target =
        Math.abs(e.velocityX) > 400
          ? e.velocityX > 0 ? snapped + 180 : snapped - 180
          : snapped;
      rotY.value = withSpring(target, { damping: 22, stiffness: 140, mass: 1.0 });
      flipped.value = ((Math.round(target / 180) % 2) + 2) % 2 === 1;
    });

  const tapGesture = Gesture.Tap().onStart(() => {
    "worklet";
    const next = !flipped.value;
    flipped.value = next;
    const base = Math.round(rotY.value / 360) * 360;
    rotY.value = withSpring(next ? base + 180 : base, {
      damping: 18,
      stiffness: 120,
      mass: 1.2,
    });
  });

  const gesture = Gesture.Exclusive(dragGesture, tapGesture);
  const shaderProps = { flipAbs, clock, refraction, shimmer, lightX, lightY };

  return (
    <View style={styles.screen}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.shadowWrap}>
          <View style={styles.cardContainer}>
            <CardFace rotY={rotY} offset={0} lightX={lightX} lightY={lightY}>
              <FaceShader {...shaderProps} isFront />
              <FrontContent isNumberFontReady={fontsLoaded} lightX={lightX} lightY={lightY} />
            </CardFace>
            <CardFace rotY={rotY} offset={180} absolute lightX={lightX} lightY={lightY}>
              <FaceShader {...shaderProps} isFront={false} />
              <BackContent lightX={lightX} lightY={lightY} />
            </CardFace>
          </View>
        </Animated.View>
      </GestureDetector>
      <Text style={styles.hint}>tap to flip · drag to inspect</Text>
    </View>
  );
}
