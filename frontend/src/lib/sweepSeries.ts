import type { SweepPoint } from "./types";

export interface SeriesSpec {
  key: "power_mW" | "current_mA" | "voltage_V";
  label: string;
  unit: string;
  color: string;
  decimals: number;
}

/**
 * Small multiples, not a dual-axis chart. Voltage sits near-constant around
 * 3.9 V while power ranges into the hundreds of mW — on a shared scale the
 * voltage trace would be a flat line pinned to the axis, and two y-scales
 * would make the crossings between series look meaningful when they aren't.
 * Each measure gets its own panel and its own scale; the x axis is shared.
 */
export const SERIES: readonly SeriesSpec[] = [
  { key: "power_mW", label: "Power", unit: "mW", color: "#ff9500", decimals: 2 },
  {
    key: "current_mA",
    label: "Current",
    unit: "mA",
    color: "#34c759",
    decimals: 2,
  },
  {
    key: "voltage_V",
    label: "Voltage",
    unit: "V",
    color: "#007aff",
    decimals: 3,
  },
];

/** Shared x/y geometry so the exported panels match what's on screen. */
export function seriesData(spec: SeriesSpec, points: SweepPoint[]) {
  return points.map((p) => ({ x: p.duty_percent, y: p[spec.key] }));
}
