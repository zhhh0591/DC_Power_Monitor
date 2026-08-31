export interface EnergyReading {
  current_mA: number;
  voltage_V: number;
  power_mW: number;
  shuntvoltage_mV: number;
  energy_mWh: number;
}

/** A reading tagged with the client-side timestamp it arrived. */
export interface TimestampedReading extends EnergyReading {
  t: number;
}

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export const MQTT_CONFIG = {
  url: "wss://broker.emqx.io:8084/mqtt",
  topic: "dc_monitor/data",
  /** Outbound topic the ESP32 listens on for control commands. */
  cmdTopic: "dc_monitor/cmd",
  /** Per-step readings streamed during a PWM sweep. */
  sweepTopic: "dc_monitor/sweep",
} as const;

/** Commands the firmware accepts on {@link MQTT_CONFIG.cmdTopic}. */
export type DeviceCommand = "on" | "off" | "reset" | "test";

/** One PWM step measured during a sweep. */
export interface SweepPoint {
  duty: number;
  /** duty as a percentage of full scale. Derived when the firmware omits it. */
  duty_percent: number;
  voltage_V: number;
  current_mA: number;
  power_mW: number;
}

export type SweepStatus = "idle" | "running" | "complete";

export interface SweepState {
  status: SweepStatus;
  points: SweepPoint[];
}

/** Full-scale PWM duty: the firmware sweeps 0..255 in steps of 15. */
export const SWEEP_DUTY_MAX = 255;

/** Steps the firmware emits per sweep — drives the progress indicator. */
export const SWEEP_EXPECTED_POINTS = 18;

/**
 * If a running sweep goes quiet for this long we stop waiting. The firmware
 * only emits "complete" on the happy path, so without this the overlay could
 * spin forever on a dropped packet.
 */
export const SWEEP_STALL_MS = 12000;

/** Number of points kept in the rolling history buffer. */
export const HISTORY_SIZE = 60;
