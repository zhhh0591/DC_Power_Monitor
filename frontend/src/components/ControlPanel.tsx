"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectionStatus, DeviceCommand } from "@/lib/types";

interface ButtonSpec {
  command: DeviceCommand;
  label: string;
  /** Fill colour of the button. */
  bg: string;
  /** Label colour on that fill. */
  fg: string;
  /** Colour used for the "sent" ripple. */
  flash: string;
}

const BUTTONS: ButtonSpec[] = [
  {
    command: "on",
    label: "ON",
    bg: "var(--green)",
    fg: "#ffffff",
    flash: "var(--green)",
  },
  {
    command: "off",
    label: "OFF",
    bg: "var(--fill-neutral)",
    fg: "var(--text-primary)",
    flash: "var(--text-secondary)",
  },
  {
    command: "reset",
    label: "RESET",
    bg: "var(--orange)",
    fg: "#ffffff",
    flash: "var(--orange)",
  },
  {
    command: "test",
    label: "TEST",
    bg: "#5856d6",
    fg: "#ffffff",
    flash: "#5856d6",
  },
];

/** How long the "Sent" / "Failed" label stays up, in ms. */
const FEEDBACK_MS = 1100;

type Feedback = { command: DeviceCommand; ok: boolean; nonce: number };

interface ControlPanelProps {
  status: ConnectionStatus;
  onCommand: (command: DeviceCommand) => Promise<void>;
  /** Fired after "test" publishes, to open the sweep view. */
  onSweepStart: () => void;
}

export default function ControlPanel({
  status,
  onCommand,
  onSweepStart,
}: ControlPanelProps) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nonceRef = useRef(0);

  // Don't leave a timer running past unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const send = useCallback(
    async (command: DeviceCommand) => {
      let ok = true;
      try {
        await onCommand(command);
        // Only open the sweep view once the command is actually on the wire.
        if (command === "test") onSweepStart();
      } catch {
        ok = false;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      // Bumping the nonce restarts the CSS animation on repeated clicks.
      nonceRef.current += 1;
      setFeedback({ command, ok, nonce: nonceRef.current });
      timerRef.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    },
    [onCommand, onSweepStart],
  );

  const online = status === "connected";

  return (
    <div
      className="card-enter rounded-[20px] bg-[color:var(--surface)] p-5 sm:p-6"
      style={{ boxShadow: "var(--card-shadow)", animationDelay: "280ms" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium uppercase tracking-wide text-[color:var(--text-secondary)]">
          Control
        </span>
        <span className="font-mono text-[12px] text-[color:var(--text-secondary)]">
          dc_monitor/cmd
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {BUTTONS.map((b) => {
          const active = feedback?.command === b.command;
          const label = active ? (feedback.ok ? "Sent" : "Failed") : b.label;
          return (
            <button
              key={b.command}
              type="button"
              onClick={() => send(b.command)}
              disabled={!online}
              aria-label={`Send ${b.command} command`}
              className={`relative h-[52px] rounded-[14px] text-[16px] font-semibold tracking-tight transition-[transform,opacity,filter] duration-150 ease-out active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 sm:h-[56px] sm:text-[17px] ${
                online ? "hover:brightness-[0.96]" : ""
              }`}
              style={{ backgroundColor: b.bg, color: b.fg }}
            >
              {/* Ripple lives on its own node: re-keying it restarts the
                  animation on rapid repeat clicks without remounting the
                  button (which would drop keyboard focus mid-interaction). */}
              {active && (
                <span
                  key={feedback.nonce}
                  aria-hidden
                  className="btn-sent pointer-events-none absolute inset-0 rounded-[14px]"
                  // Consumed by the .btn-sent keyframes.
                  style={{ ["--flash-color" as string]: b.flash }}
                />
              )}
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[12px] text-[color:var(--text-secondary)]">
        {online
          ? "Commands publish on the live connection."
          : "Buttons enable once the broker connection is up."}
      </p>

      {/* The buttons carry a fixed aria-label, so announce results here. */}
      <span role="status" aria-live="polite" className="sr-only">
        {feedback
          ? `${feedback.command} command ${feedback.ok ? "sent" : "failed"}`
          : ""}
      </span>
    </div>
  );
}
