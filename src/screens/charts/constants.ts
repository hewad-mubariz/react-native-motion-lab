export const S = 15; // 2D cube size in bar mode
export const TW = 17; // iso tile half-width
export const TH = 8.5; // iso tile half-height (2:1)
export const CUBE_H = 20; // iso extrusion per cube
export const MORPH_MS = 1900;

export const METRICS = [
  {
    key: "wait",
    label: "Wait time",
    hint: "Avg wait",
  },
  {
    key: "volume",
    label: "Volume/mo",
    hint: "Requests/mo",
  },
  {
    key: "digital",
    label: "Digital %",
    hint: "Online share",
  },
] as const;

export const CATS = [
  {
    name: "City Hall",
    shortName: "City Hall",
    value: 18,
    valueLabel: "18d",
    volumeMo: 9500,
    digitalPercent: 40,
    trendPercent: 12,
    color: "#D96A9C",
    darkColor: "#8F3F67",
  },
  {
    name: "Immigration Office",
    shortName: "Immigration",
    value: 42,
    valueLabel: "42d",
    volumeMo: 3200,
    digitalPercent: 15,
    trendPercent: 24,
    color: "#C25E7F",
    darkColor: "#7F3653",
  },
  {
    name: "DMV",
    shortName: "DMV",
    value: 9,
    valueLabel: "9d",
    volumeMo: 5400,
    digitalPercent: 55,
    trendPercent: -8,
    color: "#7FB069",
    darkColor: "#4F7345",
  },
  {
    name: "Registry Office",
    shortName: "Registry",
    value: 12,
    valueLabel: "12d",
    volumeMo: 800,
    digitalPercent: 25,
    trendPercent: 3,
    color: "#EFA8C8",
    darkColor: "#9F5E7D",
  },
  {
    name: "Building Permits",
    shortName: "Permits",
    value: 35,
    valueLabel: "35d",
    volumeMo: 350,
    digitalPercent: 10,
    trendPercent: 15,
    color: "#9C6644",
    darkColor: "#68432F",
  },
  {
    name: "Tax Office",
    shortName: "Tax Office",
    value: 21,
    valueLabel: "21d",
    volumeMo: 3400,
    digitalPercent: 20,
    trendPercent: -4,
    color: "#A8C69F",
    darkColor: "#65815D",
  },
] as const;

export const ORIGINS: readonly (readonly [number, number])[] = [
  [0, 0],
  [5, 0],
  [10, 0],
  [1, 5],
  [6, 5],
  [11, 5],
];

export const STAR_POINTS = Array.from({ length: 34 }, (_, i) => {
  const rx = Math.sin(i * 127.1) * 43758.5453;
  const ry = Math.sin(i * 271.7) * 23421.631;
  return {
    x: rx - Math.floor(rx),
    y: (ry - Math.floor(ry)) * 0.35,
  };
});
