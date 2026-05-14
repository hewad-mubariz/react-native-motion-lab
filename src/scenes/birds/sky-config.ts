/**
 * Bird scene sky presets: labels for UI and clear colors for the first frame /
 * letterboxing. Shader `fragmentMain` branches on the same index (see
 * `uniforms.skyPreset`).
 */
export const BIRDS_SKY_PRESETS = [
  {
    id: "dusk",
    label: "Dusk murmuration",
    shortLabel: "Dusk",
    clearColor: { r: 0.96, g: 0.62, b: 0.45 },
  },
  {
    id: "lavender",
    label: "Lavender mist",
    shortLabel: "Mist",
    clearColor: { r: 0.82, g: 0.78, b: 0.96 },
  },
  {
    id: "day",
    label: "Clear day",
    shortLabel: "Day",
    clearColor: { r: 0.58, g: 0.76, b: 0.98 },
  },
  {
    id: "lake",
    label: "Lake sunset",
    shortLabel: "Lake",
    clearColor: { r: 0.95, g: 0.34, b: 0.12 },
  },
] as const;

export type BirdsSkyPresetId = (typeof BIRDS_SKY_PRESETS)[number]["id"];

export const BIRDS_SKY_PRESET_COUNT = BIRDS_SKY_PRESETS.length;

export const clampSkyPresetIndex = (index: number) =>
  Math.max(
    0,
    Math.min(BIRDS_SKY_PRESET_COUNT - 1, Math.floor(Number.isFinite(index) ? index : 0)),
  );
