import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type BirdsShapeTool = "text" | "heart" | "star" | "moon";

interface BirdsToolbarProps {
  nameText: string;
  nameModeEnabled: boolean;
  onNameSubmit: (nameText: string) => void;
  onNameModeChange: (enabled: boolean) => void;
  onShapeSelect?: (shape: BirdsShapeTool) => void;
}

const shapeTools: Array<{ id: BirdsShapeTool; label: string }> = [
  { id: "heart", label: "♡" },
  { id: "star", label: "☆" },
  { id: "moon", label: "☾" },
  { id: "text", label: "T" },
];

const COMPACT_WIDTH = 224;
const EXPANDED_WIDTH = 332;
const TOOLBAR_HEIGHT = 56;

interface ToolButtonProps {
  active: boolean;
  label: string;
  isTextTool: boolean;
  onPress: () => void;
}

const ToolButton = ({
  active,
  label,
  isTextTool,
  onPress,
}: ToolButtonProps) => {
  const activeProgress = useSharedValue(active ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, { duration: 200 });
  }, [active, activeProgress]);

  const buttonStyle = useAnimatedStyle(() => {
    const scale = 1 - pressProgress.value * 0.08 + activeProgress.value * 0.02;

    return {
      backgroundColor: interpolateColor(
        activeProgress.value,
        [0, 1],
        ["rgba(5, 7, 10, 0)", "#178bff"],
      ),
      transform: [{ scale }],
    };
  });

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      activeProgress.value,
      [0, 1],
      ["#0c1420", "#ffffff"],
    ),
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        pressProgress.value = withTiming(1, { duration: 120 });
      }}
      onPressOut={() => {
        pressProgress.value = withTiming(0, { duration: 200 });
      }}
    >
      <Animated.View style={[styles.toolButton, buttonStyle]}>
        <Animated.Text
          style={[
            styles.toolLabel,
            isTextTool && styles.textToolLabel,
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
};

export const BirdsToolbar = ({
  nameText,
  nameModeEnabled,
  onNameSubmit,
  onNameModeChange,
  onShapeSelect,
}: BirdsToolbarProps) => {
  const [activeTool, setActiveTool] = useState<BirdsShapeTool | null>(
    nameModeEnabled ? "text" : null,
  );
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(nameText);
  const inputRef = useRef<TextInput>(null);
  const nameTextRef = useRef(nameText);

  const editProgress = useSharedValue(0);
  const keyboardOffset = useSharedValue(0);

  const supportsGlass = useMemo(
    () => Platform.OS === "ios" && isGlassEffectAPIAvailable(),
    [],
  );

  useEffect(() => {
    nameTextRef.current = nameText;
  }, [nameText]);

  useEffect(() => {
    editProgress.value = withTiming(editing ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });

    // When edit mode opens, prime the draft with the latest committed name
    // so users always start from the current value and can cancel back to it.
    if (editing) {
      setDraftName(nameTextRef.current);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, editProgress]);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      return;
    }

    const showSub = Keyboard.addListener("keyboardWillShow", (event) => {
      keyboardOffset.value = withTiming(event.endCoordinates.height, {
        duration: event.duration ?? 220,
      });
    });
    const hideSub = Keyboard.addListener("keyboardWillHide", (event) => {
      keyboardOffset.value = withTiming(0, {
        duration: event.duration ?? 220,
      });
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  const selectTool = (tool: BirdsShapeTool) => {
    if (tool === "text") {
      // Tapping T just opens the editor. The text formation only kicks in
      // once the user hits Set with non-empty content (see `commit`).
      setEditing(true);
      return;
    }

    // Compute the next tool first, then apply state updates and parent
    // callbacks separately. Calling `onNameModeChange` (a parent setState)
    // from inside `setActiveTool`'s updater would be a setState-during-render.
    const nextTool = activeTool === tool ? null : tool;
    setActiveTool(nextTool);
    setEditing(false);
    onNameModeChange(nextTool !== null);
    if (nextTool) {
      onShapeSelect?.(nextTool);
    }
  };

  const trimmedDraftName = draftName.trim();
  const isSubmitDisabled = trimmedDraftName.length === 0 && nameText.length === 0;

  const commit = () => {
    if (isSubmitDisabled) {
      return;
    }

    Keyboard.dismiss();
    if (trimmedDraftName.length === 0) {
      // Empty text means no text formation.
      if (nameText.length > 0) {
        onNameSubmit("");
      }
      if (activeTool === "text") {
        setActiveTool(null);
        onNameModeChange(false);
      }
      setEditing(false);
      return;
    }

    if (trimmedDraftName !== nameText) {
      onNameSubmit(trimmedDraftName);
    }
    setActiveTool("text");
    onShapeSelect?.("text");
    onNameModeChange(true);
    setEditing(false);
  };

  const cancel = () => {
    Keyboard.dismiss();
    setDraftName(nameText);
    setEditing(false);
  };

  const containerStyle = useAnimatedStyle(() => ({
    width: interpolate(
      editProgress.value,
      [0, 1],
      [COMPACT_WIDTH, EXPANDED_WIDTH],
    ),
    transform: [{ translateY: -keyboardOffset.value }],
  }));

  const compactStyle = useAnimatedStyle(() => ({
    opacity: interpolate(editProgress.value, [0, 0.45], [1, 0], "clamp"),
    transform: [
      { translateY: interpolate(editProgress.value, [0, 1], [0, 8]) },
    ],
  }));

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(editProgress.value, [0.55, 1], [0, 1], "clamp"),
    transform: [
      { translateY: interpolate(editProgress.value, [0, 1], [-8, 0]) },
    ],
  }));

  return (
    <View style={styles.dock} pointerEvents="box-none">
      <Animated.View style={[styles.toolbar, containerStyle]}>
        <GlassView
          style={[
            StyleSheet.absoluteFillObject,
            styles.glass,
            !supportsGlass && styles.glassFallback,
          ]}
          glassEffectStyle="regular"
          tintColor="rgba(255, 255, 255, 0.06)"
          isInteractive
        />

        <Animated.View
          pointerEvents={editing ? "none" : "auto"}
          style={[styles.layer, styles.compactLayer, compactStyle]}
        >
          {shapeTools.map((tool) => (
            <ToolButton
              key={tool.id}
              active={activeTool === tool.id}
              label={tool.label}
              isTextTool={tool.id === "text"}
              onPress={() => selectTool(tool.id)}
            />
          ))}
        </Animated.View>

        <Animated.View
          pointerEvents={editing ? "auto" : "none"}
          style={[styles.layer, styles.expandedLayer, expandedStyle]}
        >
          <Pressable
            onPress={cancel}
            hitSlop={8}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.iconButtonPressed,
            ]}
          >
            <Animated.Text style={styles.cancelLabel}>×</Animated.Text>
          </Pressable>

          <View style={styles.inputShell}>
            <TextInput
              ref={inputRef}
              value={draftName}
              onChangeText={setDraftName}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              maxLength={12}
              placeholder="Type a name"
              placeholderTextColor="rgba(12, 20, 32, 0.32)"
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={commit}
              selectionColor="#178bff"
            />
          </View>

          <Pressable
            onPress={commit}
            disabled={isSubmitDisabled}
            hitSlop={6}
            style={({ pressed }) => [
              styles.setButton,
              isSubmitDisabled && styles.setButtonDisabled,
              pressed && !isSubmitDisabled && styles.setButtonPressed,
            ]}
          >
            <Animated.Text
              style={[styles.setLabel, isSubmitDisabled && styles.setLabelDisabled]}
            >
              Set
            </Animated.Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 32,
    alignItems: "center",
  },
  toolbar: {
    height: TOOLBAR_HEIGHT,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#05070a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  glass: {
    borderRadius: 22,
  },
  glassFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.86)",
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
  },
  compactLayer: {
    paddingHorizontal: 12,
    justifyContent: "center",
    gap: 6,
  },
  expandedLayer: {
    paddingHorizontal: 8,
    gap: 8,
  },
  toolButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  toolLabel: {
    color: "#0c1420",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
  },
  textToolLabel: {
    fontSize: 19,
    fontFamily: "serif",
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonPressed: {
    backgroundColor: "rgba(12, 20, 32, 0.08)",
  },
  cancelLabel: {
    color: "#0c1420",
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "400",
  },
  inputShell: {
    flex: 1,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(12, 20, 32, 0.06)",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  input: {
    color: "#0c1420",
    fontSize: 16,
    fontWeight: "600",
    paddingVertical: 0,
    letterSpacing: 0.3,
  },
  setButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: "#178bff",
    alignItems: "center",
    justifyContent: "center",
  },
  setButtonPressed: {
    backgroundColor: "#0f74d8",
  },
  setButtonDisabled: {
    backgroundColor: "rgba(23, 139, 255, 0.35)",
  },
  setLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  setLabelDisabled: {
    color: "rgba(255, 255, 255, 0.78)",
  },
});
