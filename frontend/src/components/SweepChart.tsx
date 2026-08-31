"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { SweepPoint } from "@/lib/types";

ChartJS.register(LinearScale, PointElement, LineElement, Filler, Tooltip);

import { SERIES, seriesData, type SeriesSpec } from "@/lib/sweepSeries";

function Panel({
  spec,
  points,
  onChart,
  showAxis,
}: {
  spec: SeriesSpec;
  points: SweepPoint[];
  onChart: (key: string, chart: ChartJS<"line"> | null) => void;
  showAxis: boolean;
}) {
  const data = useMemo(
    () => ({
      datasets: [
        {
          label: spec.label,
          data: seriesData(spec, points),
          borderColor: spec.color,
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx: { chart: ChartJS }) => {
            const { ctx: c, chartArea } = ctx.chart;
            if (!chartArea) return "transparent";
            const g = c.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom,
            );
            g.addColorStop(0, `${spec.color}30`);
            g.addColorStop(1, `${spec.color}00`);
            return g;
          },
          tension: 0.35,
          pointRadius: 2.5,
          pointBackgroundColor: spec.color,
          // 2px surface ring so overlapping markers stay separable.
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.5,
          pointHoverRadius: 6,
          pointHoverBorderWidth: 2,
        },
      ],
    }),
    [points, spec],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // Points stream in ~0.9s apart; a 420ms ease lets each new segment draw
      // itself without the line still moving when the next one lands.
      animation: { duration: 420, easing: "easeOutCubic" },
      interaction: { mode: "nearest", axis: "x", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(29,29,31,0.92)",
          padding: 12,
          cornerRadius: 12,
          displayColors: false,
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          titleFont: { size: 12, weight: "normal" },
          bodyFont: { size: 13, weight: 500 },
          titleMarginBottom: 8,
          callbacks: {
            // Every panel reports all four values, so hovering any one of them
            // gives the complete operating point.
            title: (items) => {
              const p = points[items[0].dataIndex];
              return p ? `Duty ${p.duty_percent.toFixed(1)}%  (${p.duty})` : "";
            },
            label: (item) => {
              const p = points[item.dataIndex];
              if (!p) return "";
              return [
                `Voltage   ${p.voltage_V.toFixed(3)} V`,
                `Current   ${p.current_mA.toFixed(2)} mA`,
                `Power     ${p.power_mW.toFixed(2)} mW`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: 100,
          grid: { display: false },
          border: { display: false },
          ticks: {
            display: showAxis,
            color: "#8e8e93",
            font: { size: 11 },
            stepSize: 25,
            callback: (v) => `${v}%`,
            padding: 6,
          },
        },
        y: {
          grid: { color: "rgba(60,60,67,0.08)" },
          border: { display: false },
          ticks: {
            color: "#8e8e93",
            font: { size: 11 },
            maxTicksLimit: 4,
            padding: 8,
          },
        },
      },
    }),
    [points, showAxis],
  );

  const last = points.length ? points[points.length - 1][spec.key] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: spec.color }}
            aria-hidden
          />
          {/* Text label, not colour alone, carries the series identity. */}
          <span className="text-[13px] font-medium text-[color:var(--text-primary)]">
            {spec.label}
          </span>
          <span className="text-[12px] text-[color:var(--text-secondary)]">
            {spec.unit}
          </span>
        </div>
        {last !== null && (
          <span className="text-[13px] font-semibold tabular-nums text-[color:var(--text-primary)]">
            {last.toFixed(spec.decimals)}
            <span className="ml-1 font-normal text-[color:var(--text-secondary)]">
              {spec.unit}
            </span>
          </span>
        )}
      </div>
      <div className={showAxis ? "h-[150px]" : "h-[132px]"}>
        <Line
          data={data}
          options={options}
          ref={(c) => onChart(spec.key, c as ChartJS<"line"> | null)}
        />
      </div>
    </div>
  );
}

export default function SweepChart({
  points,
  onChart,
}: {
  points: SweepPoint[];
  onChart: (key: string, chart: ChartJS<"line"> | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {SERIES.map((spec, i) => (
        <Panel
          key={spec.key}
          spec={spec}
          points={points}
          onChart={onChart}
          showAxis={i === SERIES.length - 1}
        />
      ))}
      <p className="mt-1 text-center text-[12px] text-[color:var(--text-secondary)]">
        PWM duty cycle (%)
      </p>
    </div>
  );
}
