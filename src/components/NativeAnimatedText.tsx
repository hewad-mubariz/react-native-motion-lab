import { Host, Text as UIText } from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  contentTransition,
  font,
  foregroundStyle,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import type { StyleProp, ViewStyle } from "react-native";

type NativeAnimatedTextProps = {
  value: string;
  color?: string;
  size?: number;
  weight?: "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
  animatedValue?: number;
  align?: "center" | "leading" | "trailing";
  maxWidth?: number;
  width?: number;
  style?: StyleProp<ViewStyle>;
};

export const NativeAnimatedText = ({
  value,
  color = "#ffffff",
  size = 14,
  weight = "semibold",
  animatedValue,
  align = "leading",
  maxWidth,
  width,
  style,
}: NativeAnimatedTextProps) => {
  const estimatedWidth = Math.min(
    maxWidth ?? 360,
    Math.max(22, Math.ceil(value.length * size * 0.64)),
  );
  const textHeight = Math.ceil(size * 1.32);

  return (
    <Host
      matchContents={false}
      style={[
        {
          width: width ?? maxWidth ?? estimatedWidth,
          height: textHeight,
          alignItems:
            align === "trailing"
              ? "flex-end"
              : align === "center"
                ? "center"
                : "flex-start",
          justifyContent: "center",
        },
        style,
      ]}
      colorScheme="dark"
    >
      <UIText
        modifiers={[
          font({ size, weight, design: "rounded" }),
          foregroundStyle(color),
          frame({ maxWidth, alignment: align }),
          ...(animatedValue === undefined
            ? []
            : [
                contentTransition("numericText"),
                animation(
                  Animation.spring({ response: 0.4, dampingFraction: 0.62 }),
                  animatedValue,
                ),
              ]),
        ]}
      >
        {value}
      </UIText>
    </Host>
  );
};
