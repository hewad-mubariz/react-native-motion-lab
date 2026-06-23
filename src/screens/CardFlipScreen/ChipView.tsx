import { Canvas, LinearGradient, Rect, RoundedRect, vec } from "@shopify/react-native-skia";

const CW = 56, CH = 42, CR = 8;
const MID_Y = CH / 2, DIV_V1 = CW / 3, DIV_V2 = (CW * 2) / 3;

export function ChipView() {
  return (
    <Canvas style={{ width: CW, height: CH }}>
      <RoundedRect x={0} y={0} width={CW} height={CH} r={CR}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(CW, CH)}
          colors={["#f2df9b", "#b88a2d", "#775018", "#d3b15e"]}
          positions={[0, 0.34, 0.7, 1]}
        />
      </RoundedRect>
      <RoundedRect x={2} y={2} width={CW - 4} height={CH - 4} r={CR - 2}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(CW, CH)}
          colors={["rgba(255,255,230,0.24)", "rgba(60,33,0,0.16)"]}
        />
      </RoundedRect>
      <Rect x={0} y={MID_Y - 0.65} width={CW} height={1.3} color="rgba(50,26,0,0.58)" />
      <Rect x={DIV_V1 - 0.65} y={4} width={1.3} height={CH - 8} color="rgba(50,26,0,0.48)" />
      <Rect x={DIV_V2 - 0.65} y={4} width={1.3} height={CH - 8} color="rgba(50,26,0,0.48)" />
      <RoundedRect x={17} y={8} width={22} height={26} r={7} color="rgba(42,22,0,0.34)" />
      <RoundedRect x={19} y={10} width={18} height={22} r={6} color="rgba(232,205,130,0.20)" />
      <Rect x={2} y={10} width={14} height={1.2} color="rgba(55,29,0,0.42)" />
      <Rect x={2} y={31} width={14} height={1.2} color="rgba(55,29,0,0.42)" />
      <Rect x={40} y={10} width={14} height={1.2} color="rgba(55,29,0,0.42)" />
      <Rect x={40} y={31} width={14} height={1.2} color="rgba(55,29,0,0.42)" />
      <RoundedRect x={3} y={3} width={CW - 6} height={9} r={5}>
        <LinearGradient
          start={vec(0, 3)}
          end={vec(0, 12)}
          colors={["rgba(255,255,235,0.42)", "rgba(255,255,235,0)"]}
        />
      </RoundedRect>
    </Canvas>
  );
}
