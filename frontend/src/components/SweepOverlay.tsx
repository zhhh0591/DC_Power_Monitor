"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chart as ChartJS } from "chart.js";
import SweepChart from "./SweepChart";
import {
  exportCsv,
  exportPng,
  exportXlsx,
  renderSweepPng,
  sweepFilename,
} from "@/lib/sweepExport";
import { SWEEP_EXPECTED_POINTS, type SweepState } from "@/lib/types";

interface SweepOverlayProps {
  sweep: SweepState;
  onClose: () => void;
}

type ExportKind = "csv" | "xlsx" | "png";

export default function SweepOverlay({ sweep, onClose }: SweepOverlayProps) {
  const chartsRef = useRef(new Map<string, ChartJS<"line">>());
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const registerChart = useCallback(
    (key: string, chart: ChartJS<"line"> | null) => {
      if (chart) chartsRef.current.set(key, chart);
      else chartsRef.current.delete(key);
      // Dev-only handle so the e2e check can assert on the tooltip model;
      // Chart.js renders tooltips into the canvas, so there's no DOM to query.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __sweepCharts?: ChartJS<"line">[] }).__sweepCharts =
          [...chartsRef.current.values()];
      }
    },
    [],
  );

  // Escape always works, even mid-sweep, so the overlay can't trap you.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Don't let the dashboard scroll behind the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const running = sweep.status === "running";
  const done = sweep.status === "complete";
  const points = sweep.points;
  const canExport = done && points.length > 0;

  const buildPng = useCallback(
    () => renderSweepPng(points, "DC Energy Monitor · Power Sweep"),
    [points],
  );

  const runExport = useCallback(
    async (kind: ExportKind) => {
      setBusy(kind);
      setExportError(null);
      try {
        const name = sweepFilename();
        if (kind === "csv") {
          exportCsv(points, name);
        } else if (kind === "png") {
          const png = buildPng();
          if (!png) throw new Error("Chart is not ready yet");
          exportPng(png, name);
        } else {
          const png = buildPng();
          if (!png) throw new Error("Chart is not ready yet");
          await exportXlsx(points, png, name);
        }
      } catch (err) {
        setExportError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(null);
      }
    },
    [points, buildPng],
  );

  const progress = Math.min(
    100,
    (points.length / SWEEP_EXPECTED_POINTS) * 100,
  );

  return (
    <div
      className="overlay-enter fixed inset-0 z-50 overflow-y-auto"
      style={{
        backgroundColor: "rgba(242,242,247,0.72)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Power sweep"
    >
      <div className="mx-auto w-full max-w-[860px] px-4 py-8 sm:px-6 sm:py-12">
        <div
          className="sheet-enter rounded-[20px] bg-[color:var(--surface)] p-5 sm:p-7"
          style={{ boxShadow: "0 12px 48px rgba(0,0,0,0.12)" }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-bold tracking-tight text-[color:var(--text-primary)] sm:text-[28px]">
                Power Sweep
              </h2>
              <p className="mt-1 text-[14px] text-[color:var(--text-secondary)]">
                PWM duty swept 0–100% · {points.length} of{" "}
                {SWEEP_EXPECTED_POINTS} points
              </p>
            </div>
            <div className="flex items-center gap-3">
              {running ? (
                <span className="flex items-center gap-2 rounded-full bg-[#fff4e5] px-3 py-1.5 text-[13px] font-medium text-[#c76d00]">
                  <span
                    className="inline-block h-2 w-2 rounded-full status-pulse"
                    style={{ backgroundColor: "var(--orange)" }}
                    aria-hidden
                  />
                  Sweeping…
                </span>
              ) : done ? (
                <span className="flex items-center gap-2 rounded-full bg-[#e8f8ed] px-3 py-1.5 text-[13px] font-medium text-[#1c7c37]">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: "var(--green)" }}
                    aria-hidden
                  />
                  Complete
                </span>
              ) : null}
              {/* Escape hatch: always available, even while sweeping. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sweep view"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f2f7] text-[15px] text-[color:var(--text-secondary)] transition-colors hover:bg-[#e5e5ea]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-[#f2f2f7]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${done ? 100 : progress}%`,
                backgroundColor: done ? "var(--green)" : "var(--orange)",
                transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>

          {/* Charts */}
          <div className="mt-6">
            {points.length === 0 ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-3">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full status-pulse"
                  style={{ backgroundColor: "var(--orange)" }}
                  aria-hidden
                />
                <p className="text-[15px] text-[color:var(--text-secondary)]">
                  Waiting for the first reading…
                </p>
              </div>
            ) : (
              <SweepChart points={points} onChart={registerChart} />
            )}
          </div>

          {exportError && (
            <p className="mt-4 text-[13px] text-[color:var(--red)]">
              {exportError}
            </p>
          )}

          {/* Actions */}
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={!canExport}
              className="h-[48px] flex-1 rounded-[14px] text-[16px] font-semibold text-white transition-[transform,opacity] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "#007aff" }}
            >
              Done
            </button>
            {(
              [
                ["csv", "Export CSV"],
                ["xlsx", "Export Excel"],
                ["png", "Save Chart"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => runExport(kind)}
                disabled={!canExport || busy !== null}
                className="h-[48px] flex-1 rounded-[14px] bg-[#f2f2f7] text-[16px] font-semibold text-[color:var(--text-primary)] transition-[transform,opacity] duration-150 hover:bg-[#e9e9ee] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === kind ? "Working…" : label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-center text-[12px] text-[color:var(--text-secondary)]">
            {canExport
              ? "Excel export includes the data table and the chart image."
              : "Actions unlock when the sweep finishes."}
          </p>
        </div>
      </div>
    </div>
  );
}
