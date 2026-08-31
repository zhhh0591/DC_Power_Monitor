"use client";

import type { ConnectionStatus } from "@/lib/types";

const CONFIG: Record<
  ConnectionStatus,
  { color: string; label: string; pulse: boolean }
> = {
  connected: { color: "var(--green)", label: "Connected", pulse: false },
  connecting: { color: "var(--yellow)", label: "Connecting", pulse: true },
  reconnecting: { color: "var(--yellow)", label: "Reconnecting", pulse: true },
  disconnected: { color: "var(--red)", label: "Disconnected", pulse: false },
  error: { color: "var(--red)", label: "Connection error", pulse: false },
};

export default function StatusIndicator({
  status,
}: {
  status: ConnectionStatus;
}) {
  const { color, label, pulse } = CONFIG[status];
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          pulse ? "status-pulse" : ""
        }`}
        style={{
          backgroundColor: color,
          boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 18%, transparent)`,
        }}
        aria-hidden
      />
      <span className="text-[15px] font-medium text-[color:var(--text-secondary)]">
        {label}
      </span>
    </div>
  );
}
