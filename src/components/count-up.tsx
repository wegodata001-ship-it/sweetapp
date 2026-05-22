"use client";

import { useEffect, useMemo, useState } from "react";

type CountUpProps = {
  value: number;
  currency?: boolean;
  className?: string;
  duration?: number;
};

export function CountUp({ value, currency = false, className, duration = 900 }: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat("he-IL", {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      }),
    [],
  );

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const startTime = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span className={className}>
      {currency ? "₪" : ""}
      {formatter.format(Math.round(display))}
    </span>
  );
}
