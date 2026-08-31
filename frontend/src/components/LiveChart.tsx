"use client";

import { useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { TimestampedReading } from "@/lib/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip
);

type MetricKey = "power_mW" | "voltage_V" | "current_mA" | "energy_mWh";

const METRICS: Record<
  MetricKey,
  { label: string; unit: string; color: string; decimals: number }
> = {
  power_mW: { label: "Power", unit: "mW", color: "#ff9500", decimals: 2 },
  voltage_V: { label: "Voltage", unit: "V", color: "#007aff", decimals: 2 },
  current_mA: { label: "Current", unit: "mA", color: "#34c759", decimals: 2 },
  energy_mWh: { label: "Energy", unit: "mWh", color: "#af52de", decimals: 2 },
};

const ORDER: MetricKey[] = [
  "power_mW",
  "voltage_V",
  "current_mA",
  "energy_mWh",
];

export default function LiveChart({
  history,
}: {
  history: TimestampedReading[];
}) {
  const [metric, setMetric] = useState<MetricKey>("power_mW");
  const conf = METRICS[metric];

  const data = useMemo(() => {
    return {
      labels: history.map((h) =>
        new Date(h.t).toLocaleTimeString(undefined, {
          minute: "2-digit",
          second: "2-digit",
        })
      ),
      datasets: [
        {
          data: history.map((h) => h[metric]),
          borderColor: conf.color,
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx: { chart: ChartJS }) => {
            const { ctx: c, chartArea } = ctx.chart;
            if (!chartArea) return "transparent";
            const g = c.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom
            );
            g.addColorStop(0, `${conf.color}33`);
            g.addColorStop(1, `${conf.color}00`);
            return g;
          },
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: conf.color,
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
        },
      ],
    };
  }, [history, metric, conf.color]);

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250, easing: "easeOutCubic" },
      interaction: { mode: "index", intersect: false },
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
          bodyFont: { size: 15, weight: 600 },
          callbacks: {
            label: (item) =>
              `${item.formattedValue} ${conf.unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#8e8e93",
            font: { size: 11 },
            maxTicksLimit: 6,
            maxRotation: 0,
            autoSkip: true,
          },
        },
        y: {
          grid: { color: "rgba(60,60,67,0.08)" },
          border: { display: false },
          ticks: {
            color: "#8e8e93",
            font: { size: 11 },
            maxTicksLimit: 5,
            padding: 8,
          },
        },
      },
    }),
    [conf.unit]
  );

  return (
    <div
      className="card-enter rounded-[20px] bg-[color:var(--surface)] p-5 sm:p-6"
      style={{ boxShadow: "var(--card-shadow)", animationDelay: "280ms" }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[17px] font-semibold text-[color:var(--text-primary)]">
            {conf.label} history
          </h2>
          <p className="text-[13px] text-[color:var(--text-secondary)]">
            Last {history.length} readings ({conf.unit})
          </p>
        </div>

        {/* iOS-style segmented control */}
        <div className="flex gap-1 rounded-[12px] bg-[#f2f2f7] p-1">
          {ORDER.map((key) => {
            const active = key === metric;
            return (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className="rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  backgroundColor: active ? "#ffffff" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {METRICS[key].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 h-[240px] w-full sm:h-[300px]">
        {history.length > 0 ? (
          <Line data={data} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-[15px] text-[color:var(--text-secondary)]">
            Waiting for data…
          </div>
        )}
      </div>
    </div>
  );
}
