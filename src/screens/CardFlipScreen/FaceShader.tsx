import { Canvas, RoundedRect, Shader } from "@shopify/react-native-skia";
import { SharedValue, useDerivedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native";
import { CARD_W, CARD_H, CARD_R, glassEffect } from "./constants";

export interface FaceShaderProps {
  flipAbs: SharedValue<number>;
  clock: SharedValue<number>;
  refraction: SharedValue<number>;
  shimmer: SharedValue<number>;
  lightX: SharedValue<number>;
  lightY: SharedValue<number>;
  isFront: boolean;
}

export function FaceShader({
  flipAbs,
  clock,
  refraction,
  shimmer,
  lightX,
  lightY,
  isFront,
}: FaceShaderProps) {
  const uniforms = useDerivedValue(() => ({
    u_width: CARD_W,
    u_height: CARD_H,
    u_time: clock.value,
    u_flip: flipAbs.value,
    u_front: isFront ? 1.0 : 0.0,
    u_refraction: refraction.value,
    u_shimmer: shimmer.value,
    u_lightX: lightX.value,
    u_lightY: lightY.value,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <RoundedRect x={0} y={0} width={CARD_W} height={CARD_H} r={CARD_R}>
        <Shader source={glassEffect!} uniforms={uniforms} />
      </RoundedRect>
    </Canvas>
  );
}
