"use client";

import { useMqtt } from "@/lib/useMqtt";
import StatusIndicator from "./StatusIndicator";
import MetricCard from "./MetricCard";
import LiveChart from "./LiveChart";
import ControlPanel from "./ControlPanel";
import SweepOverlay from "./SweepOverlay";
import { useCallback, useState } from "react";

export default function Dashboard() {
  const {
    status,
    latest,
    history,
    lastError,
    publishCommand,
    sweep,
    beginSweep,
  } = useMqtt();
  const [sweepOpen, setSweepOpen] = useState(false);

  const openSweep = useCallback(() => {
    beginSweep();
    setSweepOpen(true);
  }, [beginSweep]);

  return (
    <main className="mx-auto w-full max-w-[880px] px-4 py-8 sm:px-6 sm:py-12">
      {/* Header */}
      <header className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[color:var(--text-primary)] sm:text-[34px]">
            DC Energy Monitor
          </h1>
          <p className="mt-1 text-[15px] text-[color:var(--text-secondary)]">
            Live readings · updated every second
          </p>
        </div>
        <StatusIndicator status={status} />
      </header>

      {status === "error" && lastError && (
        <div className="mb-5 rounded-[16px] bg-[color:var(--surface)] px-4 py-3 text-[14px] text-[color:var(--red)]"
          style={{ boxShadow: "var(--card-shadow)" }}>
          {lastError}
        </div>
      )}

      {/* Metric cards */}
      <section className="grid grid-cols-2 gap-4 sm:gap-5">
        <MetricCard
          label="Voltage"
          value={latest?.voltage_V ?? null}
          unit="V"
          accent="#007aff"
          index={0}
        />
        <MetricCard
          label="Current"
          value={latest?.current_mA ?? null}
          unit="mA"
          accent="#34c759"
          index={1}
        />
        <MetricCard
          label="Power"
          value={latest?.power_mW ?? null}
          unit="mW"
          accent="#ff9500"
          index={2}
        />
        <MetricCard
          label="Energy"
          value={latest?.energy_mWh ?? null}
          unit="mWh"
          accent="#af52de"
          index={3}
        />
      </section>

      {/* Device controls */}
      <section className="mt-4 sm:mt-5">
        <ControlPanel
          status={status}
          onCommand={publishCommand}
          onSweepStart={openSweep}
        />
      </section>

      {/* Live chart */}
      <section className="mt-4 sm:mt-5">
        <LiveChart history={history} />
      </section>

      <footer className="mt-8 text-center text-[12px] text-[color:var(--text-secondary)]">
        Topic <span className="font-mono">dc_monitor/data</span> · broker.emqx.io
      </footer>

      {sweepOpen && (
        <SweepOverlay sweep={sweep} onClose={() => setSweepOpen(false)} />
      )}
    </main>
  );
}
