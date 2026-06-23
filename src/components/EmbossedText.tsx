import {
  BlurMask,
  Canvas,
  Text as SkiaText,
  useFont,
} from "@shopify/react-native-skia";
import { useEffect } from "react";
import { View } from "react-native";

interface EmbossedTextProps {
  text: string;
  fontSize: number;
  charAdvance?: number;
  spaceAdvance?: number;
  width: number;
  height: number;
  baseline: number;
}

export function EmbossedText({
  text,
  fontSize,
  charAdvance,
  spaceAdvance,
  width,
  height,
  baseline,
}: EmbossedTextProps) {
  const font = useFont(
    require("../../assets/fonts/ShareTechMono-Regular.ttf"),
    fontSize,
  );
  useEffect(() => {
    font?.setLinearMetrics(true);
  }, [font]);
  if (!font) return <View style={{ width, height }} />;

  const adv = charAdvance ?? fontSize * 0.602;
  const sAdv = spaceAdvance ?? adv * 1.1;

  const chars = Array.from(text);
  const positions: { char: string; x: number }[] = [];
  let x = 0;
  for (const ch of chars) {
    if (ch !== " ") positions.push({ char: ch, x });
    x += ch === " " ? sAdv : adv;
  }

  // Physical emboss: light comes from top-left
  // shadow  → bottom-right offset  (raised letter blocks the light below it)
  // glow    → blurred ambient       (card surface backscatter)
  // core    → the plastic colour    (slightly brighter than card bg)
  // highlight → top-left offset     (light catching the raised leading edge)
  const S_DX = 1.8,
    S_DY = 1.8; // shadow offset
  const H_DX = -1.1,
    H_DY = -1.1; // highlight offset

  const layer = (dx: number, dy: number, color: string) =>
    positions.map(({ char, x: px }) => (
      <SkiaText
        key={`${dx}${dy}${px}${char}`}
        x={px + dx}
        y={baseline + dy}
        text={char}
        font={font}
        color={color}
      />
    ));

  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      {/* 1 — deep shadow */}
      {layer(S_DX, S_DY, "rgba(0,8,24,0.88)")}

      {/* 2 — ambient glow (blurred blue backscatter) */}
      {positions.map(({ char, x: px }) => (
        <SkiaText
          key={`glow${px}${char}`}
          x={px}
          y={baseline}
          text={char}
          font={font}
          color="rgba(60,140,255,0.22)"
        >
          <BlurMask blur={5} style="normal" />
        </SkiaText>
      ))}

      {/* 3 — core (the raised plastic surface) */}
      {layer(0, 0, "rgba(185,220,255,0.88)")}

      {/* 4 — bright highlight top-left */}
      {layer(H_DX, H_DY, "rgba(245,253,255,0.72)")}
    </Canvas>
  );
}
