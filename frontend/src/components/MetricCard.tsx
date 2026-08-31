"use client";

import { useCountUp } from "@/lib/useCountUp";

interface MetricCardProps {
  label: string;
  value: number | null;
  unit: string;
  decimals?: number;
  accent: string;
  /** Stagger index for the entrance animation. */
  index?: number;
}

export default function MetricCard({
  label,
  value,
  unit,
  decimals = 2,
  accent,
  index = 0,
}: MetricCardProps) {
  const animated = useCountUp(value ?? 0);
  const hasData = value !== null;

  return (
    <div
      className="card-enter rounded-[20px] bg-[color:var(--surface)] p-5 sm:p-6"
      style={{
        boxShadow: "var(--card-shadow)",
        animationDelay: `${index * 70}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <span className="text-[13px] font-medium uppercase tracking-wide text-[color:var(--text-secondary)]">
          {label}
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[40px] font-semibold leading-none tabular-nums tracking-tight text-[color:var(--text-primary)] sm:text-[44px]">
          {hasData ? animated.toFixed(decimals) : "--"}
        </span>
        <span className="text-[17px] font-medium text-[color:var(--text-secondary)]">
          {unit}
        </span>
      </div>
    </div>
  );
}
