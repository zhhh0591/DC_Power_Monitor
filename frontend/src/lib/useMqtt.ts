"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Import the explicit browser build. Turbopack does not reliably apply the
// package's "browser" export condition for client components, and the Node
// build silently fails to open a WebSocket in the browser (status stays stuck
// on "connecting"). Pointing at the ESM browser bundle forces the right one.
import mqtt from "mqtt/dist/mqtt.esm";
import type { MqttClient } from "mqtt";
import {
  HISTORY_SIZE,
  MQTT_CONFIG,
  SWEEP_DUTY_MAX,
  SWEEP_STALL_MS,
  type ConnectionStatus,
  type DeviceCommand,
  type EnergyReading,
  type SweepPoint,
  type SweepState,
  type TimestampedReading,
} from "./types";

interface UseMqttResult {
  status: ConnectionStatus;
  latest: TimestampedReading | null;
  history: TimestampedReading[];
  lastError: string | null;
  /**
   * Publish a command on the same client that receives readings.
   * Resolves once the broker has accepted the packet, rejects if the client
   * is not connected or the publish fails.
   */
  publishCommand: (command: DeviceCommand) => Promise<void>;
  sweep: SweepState;
  /** Arm the overlay locally; see {@link parseSweepMessage} for why. */
  beginSweep: () => void;
}

type SweepMessage =
  | { kind: "start" }
  | { kind: "complete" }
  | { kind: "point"; point: SweepPoint };

/**
 * Parse one message off the sweep topic.
 *
 * Deliberately tolerant of the firmware's actual payload, which omits
 * `duty_percent` — we derive it from `duty` when it isn't sent.
 */
function parseSweepMessage(raw: string): SweepMessage | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const r = obj as Record<string, unknown>;

  if (r.event === "start") return { kind: "start" };
  if (r.event === "complete") return { kind: "complete" };

  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  const duty = num(r.duty);
  const voltage_V = num(r.voltage_V);
  const current_mA = num(r.current_mA);
  const power_mW = num(r.power_mW);
  if (
    duty === null ||
    voltage_V === null ||
    current_mA === null ||
    power_mW === null
  ) {
    return null;
  }
  const sent = num(r.duty_percent);
  return {
    kind: "point",
    point: {
      duty,
      duty_percent: sent ?? (duty / SWEEP_DUTY_MAX) * 100,
      voltage_V,
      current_mA,
      power_mW,
    },
  };
}

/** Runtime guard: make sure the payload has the numeric fields we expect. */
function parseReading(raw: string): EnergyReading | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const r = obj as Record<string, unknown>;
  const fields = [
    "current_mA",
    "voltage_V",
    "power_mW",
    "shuntvoltage_mV",
    "energy_mWh",
  ] as const;
  const out: Partial<EnergyReading> = {};
  for (const f of fields) {
    const v = r[f];
    // Tolerate numbers sent as strings; reject anything non-numeric.
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || Number.isNaN(n)) return null;
    out[f] = n;
  }
  return out as EnergyReading;
}

export function useMqtt(): UseMqttResult {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [latest, setLatest] = useState<TimestampedReading | null>(null);
  const [history, setHistory] = useState<TimestampedReading[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sweep, setSweep] = useState<SweepState>({
    status: "idle",
    points: [],
  });
  const clientRef = useRef<MqttClient | null>(null);
  const stallRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Any sweep traffic pushes the stall deadline out; silence ends the run so
  // the overlay's buttons can't be stranded in a loading state.
  const armStall = useCallback(() => {
    if (stallRef.current) clearTimeout(stallRef.current);
    stallRef.current = setTimeout(() => {
      setSweep((s) =>
        s.status === "running" ? { ...s, status: "complete" } : s,
      );
    }, SWEEP_STALL_MS);
  }, []);

  useEffect(() => {
    const client = mqtt.connect(MQTT_CONFIG.url, {
      // Unique-ish client id so multiple tabs don't kick each other off the broker.
      clientId: `dc_monitor_web_${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true,
      // Force the native WebSocket transport. mqtt.js's runtime "is this a
      // browser?" detection is unreliable under bundlers (Turbopack); when it
      // guesses wrong it falls back to the Node `ws` module, which can't open a
      // socket in the browser, leaving the status stuck on "connecting".
      forceNativeWebSocket: true,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setStatus("connected");
      setLastError(null);
      // Same client, one extra topic — readings and sweep share the socket.
      client.subscribe(
        [MQTT_CONFIG.topic, MQTT_CONFIG.sweepTopic],
        { qos: 0 },
        (err) => {
          if (err) {
            setStatus("error");
            setLastError(`Subscribe failed: ${err.message}`);
          }
        },
      );
    });

    client.on("reconnect", () => setStatus("reconnecting"));
    client.on("offline", () => setStatus("disconnected"));
    client.on("close", () => {
      // Don't override a terminal error state with a routine close.
      setStatus((s) => (s === "error" ? s : "disconnected"));
    });
    client.on("error", (err) => {
      setStatus("error");
      setLastError(err.message);
    });

    client.on("message", (topic, payload) => {
      if (topic === MQTT_CONFIG.sweepTopic) {
        const msg = parseSweepMessage(payload.toString());
        if (!msg) return;
        armStall();
        if (msg.kind === "start") {
          setSweep({ status: "running", points: [] });
        } else if (msg.kind === "complete") {
          if (stallRef.current) clearTimeout(stallRef.current);
          setSweep((s) => ({ ...s, status: "complete" }));
        } else {
          setSweep((s) => {
            // A point arriving without a preceding "start" still counts as a
            // live run — the current firmware never sends one. Anything not
            // already running is a fresh sweep, so don't append to stale data.
            const fresh = s.status !== "running";
            return {
              status: "running",
              points: fresh ? [msg.point] : [...s.points, msg.point],
            };
          });
        }
        return;
      }
      if (topic !== MQTT_CONFIG.topic) return;
      const reading = parseReading(payload.toString());
      if (!reading) return;
      const stamped: TimestampedReading = { ...reading, t: Date.now() };
      setLatest(stamped);
      setHistory((prev) => {
        const next = prev.length >= HISTORY_SIZE ? prev.slice(1) : prev.slice();
        next.push(stamped);
        return next;
      });
    });

    return () => {
      // Force-close on unmount so we don't leak the socket in dev StrictMode.
      client.end(true);
      clientRef.current = null;
      if (stallRef.current) clearTimeout(stallRef.current);
    };
  }, [armStall]);

  // Reuses the very client opened above (via clientRef) — commands and readings
  // share one connection. Stable identity, so it's safe in child deps.
  const publishCommand = useCallback((command: DeviceCommand) => {
    return new Promise<void>((resolve, reject) => {
      const client = clientRef.current;
      if (!client?.connected) {
        reject(new Error("Not connected to broker"));
        return;
      }
      client.publish(
        MQTT_CONFIG.cmdTopic,
        command,
        { qos: 0, retain: false },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }, []);

  // The firmware doesn't announce "start", so the TEST click arms the run
  // locally. A real start event (if firmware gains one) just re-clears.
  const beginSweep = useCallback(() => {
    setSweep({ status: "running", points: [] });
    armStall();
  }, [armStall]);

  return {
    status,
    latest,
    history,
    lastError,
    publishCommand,
    sweep,
    beginSweep,
  };
}
