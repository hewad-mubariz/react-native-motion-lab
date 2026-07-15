export type MetricKey = "wait" | "volume" | "digital";

export type Category = {
  name: string;
  shortName: string;
  value: number;
  valueLabel: string;
  volumeMo: number;
  digitalPercent: number;
  trendPercent: number;
  color: string; // base hex
};

export type Cube = {
  // state A: 2D bar chart (screen px)
  ax: number;
  ay: number;
  // state B: iso city (grid coords)
  gx: number;
  gy: number;
  lvl: number;
  // pre-computed iso screen position (isoX/isoY at t=1)
  bx: number;
  by: number;
  // animation
  delay: number;
  jitter: number;
  isRoof: boolean;
  hTot: number;
  catIndex: number;
  tint: number;
  windowSeeds: [number, number, number, number];
};

export type Building = {
  catIndex: number;
  gx: number;
  gy: number;
  h: number;
  barCenterX: number;
  labelDelay: number;
  lift: number;
};

export type Tile = {
  gx: number;
  gy: number;
  kind: "plain" | "alt" | "green" | "road";
  delay: number;
};

export type CityLayout = {
  cubes: Cube[];
  buildings: Building[];
  tiles: Tile[];
  heights: number[];
  tallestIndex: number;
};
