import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticIntent =
  | "selection"
  | "tab"
  | "toggle"
  | "build"
  | "flatten"
  | "success";

const isSupportedPlatform = Platform.OS === "ios" || Platform.OS === "android";

const run = (effect: () => Promise<void>) => {
  if (!isSupportedPlatform) return;
  void effect().catch(() => {
    // Haptics are best-effort; unsupported devices should stay silent.
  });
};

const android = (type: Haptics.AndroidHaptics, fallback: () => Promise<void>) =>
  run(() =>
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(type)
      : fallback(),
  );

export const haptics = {
  selection: () =>
    android(Haptics.AndroidHaptics.Context_Click, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
    ),
  tab: () =>
    android(Haptics.AndroidHaptics.Segment_Tick, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    ),
  toggle: () =>
    android(Haptics.AndroidHaptics.Toggle_On, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    ),
  build: () =>
    android(Haptics.AndroidHaptics.Gesture_Start, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    ),
  flatten: () =>
    android(Haptics.AndroidHaptics.Gesture_End, () =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    ),
  success: () =>
    android(Haptics.AndroidHaptics.Confirm, () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
} satisfies Record<HapticIntent, () => void>;
