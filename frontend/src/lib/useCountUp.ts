"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Smoothly animates a displayed number from its previous value toward `target`.
 * Each new target restarts a short ease-out tween (rAF driven). Respects
 * prefers-reduced-motion by snapping straight to the target.
 */
export function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(target);
      return;
    }

    fromRef.current = display;
    startRef.current = performance.now();
    const from = fromRef.current;
    const delta = target - from;

    if (delta === 0) return;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const p = Math.min(elapsed / duration, 1);
      setDisplay(from + delta * easeOutCubic(p));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // Intentionally only re-run when target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}
