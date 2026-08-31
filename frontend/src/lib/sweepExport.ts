import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { SERIES, seriesData, type SeriesSpec } from "./sweepSeries";
import type { SweepPoint } from "./types";

ChartJS.register(LinearScale, PointElement, LineElement, Filler);

/** Columns shared by the CSV and the spreadsheet, in display order. */
const COLUMNS = [
  { key: "duty", header: "Duty (0-255)", decimals: 0, width: 14 },
  { key: "duty_percent", header: "Duty (%)", decimals: 1, width: 12 },
  { key: "voltage_V", header: "Voltage (V)", decimals: 3, width: 14 },
  { key: "current_mA", header: "Current (mA)", decimals: 2, width: 14 },
  { key: "power_mW", header: "Power (mW)", decimals: 2, width: 14 },
] as const;

/** `sweep-20260830-142530` — stable, sorts chronologically. */
export function sweepFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `sweep-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(
    d.getHours(),
  )}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick; Safari cancels the download if it happens sooner.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(points: SweepPoint[], filename: string) {
  const rows = [
    COLUMNS.map((c) => c.header).join(","),
    ...points.map((p) =>
      COLUMNS.map((c) => p[c.key].toFixed(c.decimals)).join(","),
    ),
  ];
  // BOM so Excel opens UTF-8 correctly on a double-click.
  const blob = new Blob(["﻿" + rows.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, `${filename}.csv`);
}

export function exportPng(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Build an .xlsx holding both the data table and the rendered chart.
 *
 * ExcelJS is imported on demand — it's a large dependency and nothing needs it
 * until someone actually clicks Export Excel.
 */
export async function exportXlsx(
  points: SweepPoint[],
  chartPngDataUrl: string,
  filename: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DC Energy Monitor";
  wb.created = new Date();

  const ws = wb.addWorksheet("Sweep Data");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF1D1D1F" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF2F2F7" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  for (const p of points) {
    ws.addRow(COLUMNS.map((c) => Number(p[c.key].toFixed(c.decimals))));
  }
  // Match each column's on-screen precision.
  COLUMNS.forEach((c, i) => {
    if (c.decimals > 0) {
      ws.getColumn(i + 1).numFmt = `0.${"0".repeat(c.decimals)}`;
    }
  });

  // Embed the chart image below the table rather than shipping a loose PNG.
  const imageId = wb.addImage({ base64: chartPngDataUrl, extension: "png" });
  ws.addImage(imageId, {
    tl: { col: 0, row: points.length + 2 },
    ext: { width: 760, height: 620 },
  });

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${filename}.xlsx`,
  );
}

export interface ChartPanel {
  canvas: HTMLCanvasElement;
  label: string;
  unit: string;
  color: string;
}

const EXPORT_SCALE = 2;
const PANEL_W = 420 * EXPORT_SCALE;
const PANEL_H = 130 * EXPORT_SCALE;

/**
 * Render one panel into a detached canvas.
 *
 * The export deliberately does NOT snapshot the on-screen canvases. Chart.js
 * defers redraws to an animation frame and replays its cached pointer event on
 * update(), so a tooltip open under the cursor gets baked into the image. A
 * throwaway chart with tooltips off is deterministic, and it also means the
 * export doesn't depend on the panel being visible or on the window size.
 */
function renderPanel(spec: SeriesSpec, points: SweepPoint[], showAxis: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = PANEL_W;
  canvas.height = PANEL_H;
  const s = EXPORT_SCALE;

  const chart = new ChartJS(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          data: seriesData(spec, points),
          borderColor: spec.color,
          borderWidth: 2 * s,
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
          pointRadius: 2.5 * s,
          pointBackgroundColor: spec.color,
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.5 * s,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 1,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
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
            font: { size: 11 * s },
            stepSize: 25,
            callback: (v) => `${v}%`,
            padding: 6 * s,
          },
        },
        y: {
          grid: { color: "rgba(60,60,67,0.08)", lineWidth: s },
          border: { display: false },
          ticks: {
            color: "#8e8e93",
            font: { size: 11 * s },
            maxTicksLimit: 4,
            padding: 8 * s,
          },
        },
      },
    },
  });
  chart.draw();
  return { chart, canvas };
}

/** Build the export image from scratch, independent of the live charts. */
export function renderSweepPng(
  points: SweepPoint[],
  title: string,
): string | null {
  if (points.length === 0) return null;
  const built = SERIES.map((spec, i) =>
    renderPanel(spec, points, i === SERIES.length - 1),
  );
  try {
    return composeChartPng(
      built.map(({ canvas }, i) => ({
        canvas,
        label: SERIES[i].label,
        unit: SERIES[i].unit,
        color: SERIES[i].color,
      })),
      title,
    );
  } finally {
    for (const { chart } of built) chart.destroy();
  }
}

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';

/**
 * Stack the chart canvases into one PNG on a white card background.
 *
 * The panel headings live in HTML, not on the canvases, so they're redrawn
 * here — without them the exported image would identify each series by colour
 * alone, which is exactly what the on-screen labels exist to avoid.
 */
export function composeChartPng(
  panels: ChartPanel[],
  title: string,
): string | null {
  const usable = panels.filter(
    (p) => p.canvas && p.canvas.width > 0 && p.canvas.height > 0,
  );
  if (usable.length === 0) return null;

  const scale = 2; // export at 2x so the PNG stays crisp when zoomed
  const pad = 24 * scale;
  const gap = 16 * scale;
  const labelH = 24 * scale;
  const headerH = 68 * scale;
  const footerH = 26 * scale;
  const width = Math.max(...usable.map((p) => p.canvas.width)) + pad * 2;
  const height =
    headerH +
    usable.reduce((sum, p) => sum + p.canvas.height + labelH, 0) +
    gap * (usable.length - 1) +
    footerH +
    pad;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "top";

  ctx.fillStyle = "#1d1d1f";
  ctx.font = `600 ${19 * scale}px ${FONT}`;
  ctx.fillText(title, pad, 20 * scale);

  ctx.fillStyle = "#8e8e93";
  ctx.font = `${13 * scale}px ${FONT}`;
  ctx.fillText(new Date().toLocaleString(), pad, 45 * scale);

  let y = headerH;
  for (const p of usable) {
    const dotR = 4 * scale;
    ctx.beginPath();
    ctx.arc(pad + dotR, y + 7 * scale + dotR, dotR, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.fillStyle = "#1d1d1f";
    ctx.font = `500 ${13 * scale}px ${FONT}`;
    ctx.fillText(p.label, pad + dotR * 2 + 8 * scale, y + 6 * scale);

    const labelWidth = ctx.measureText(p.label).width;
    ctx.fillStyle = "#8e8e93";
    ctx.font = `${12 * scale}px ${FONT}`;
    ctx.fillText(
      p.unit,
      pad + dotR * 2 + 8 * scale + labelWidth + 6 * scale,
      y + 7 * scale,
    );

    y += labelH;
    ctx.drawImage(p.canvas, pad, y);
    y += p.canvas.height + gap;
  }

  ctx.fillStyle = "#8e8e93";
  ctx.font = `${12 * scale}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("PWM duty cycle (%)", width / 2, y);

  return out.toDataURL("image/png");
}
