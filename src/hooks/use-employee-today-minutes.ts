"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DashboardSlice = {
  session: { clock_in: string } | null;
  today: { completed_minutes: number };
};

/** דקות עבודה היום (סשנים שהסתיימו + סשן פעיל חי) */
export function useEmployeeTodayMinutes(enabled = true) {
  const [data, setData] = useState<DashboardSlice | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/me/dashboard", { credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: DashboardSlice }
        | null;
      if (json?.ok) setData(json.data);
    } catch {
      /* */
    }
  }, [enabled]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  const todayMinutes = useMemo(() => {
    const base = data?.today.completed_minutes ?? 0;
    const session = data?.session;
    if (!session?.clock_in) return base;
    const start = new Date(session.clock_in).getTime();
    const live = Math.max(0, Math.floor((now - start) / 60_000));
    return base + live;
  }, [data, now]);

  return { todayMinutes, refresh: load };
}
