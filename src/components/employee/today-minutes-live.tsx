"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cappedOpenMinutes } from "@/lib/work-sessions/max-shift";

/** Isolated 1s tick — must not live on the tasks page or every card re-renders. */
export function TodayMinutesLive({
  completedMinutes,
  clockIn,
  render,
}: {
  completedMinutes: number;
  clockIn: string | null;
  render: (minutes: number) => ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clockIn) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [clockIn]);

  const start = clockIn ? new Date(clockIn).getTime() : 0;
  const minutes = completedMinutes + (clockIn ? cappedOpenMinutes(start, now) : 0);
  return <>{render(minutes)}</>;
}
