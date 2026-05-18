"use client";

import { CalendarDays, Clock3, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { WorkSessionDto } from "@/lib/work-sessions/serialize";

type DayGroup = {
  work_date: string;
  sessions: WorkSessionDto[];
  total_minutes: number;
  first_in: string | null;
  last_out: string | null;
};

function fmtHMM(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}

/**
 * Employee Hours UI.
 *
 * The "today" tile is computed locally from the most recent day-group so we
 * don't pay an extra roundtrip, and the live timer for an in-progress
 * session ticks once a second using a single `setInterval`.
 */
export function EmployeeHoursClient() {
  const { t, dir, locale } = useI18n();
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/work-session/history?days=30", {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { days: DayGroup[] } }
        | { ok: false }
        | null;
      if (json?.ok) setDays(json.data.days);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const bcp47 = locale === "ar" ? "ar-EG" : locale === "en" ? "en-US" : "he-IL";
  const fmtTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" })
      : "—";

  const today = days[0] ?? null;
  const liveSession = useMemo(
    () => today?.sessions.find((s) => s.status === "ACTIVE") ?? null,
    [today],
  );
  const liveMinutes = useMemo(() => {
    if (!liveSession) return 0;
    return Math.max(
      0,
      Math.floor((now - new Date(liveSession.clock_in).getTime()) / 60_000),
    );
  }, [liveSession, now]);

  const todayTotal = (today?.total_minutes ?? 0) + liveMinutes;
  const visibleDays = expanded ? days : days.slice(0, 7);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  return (
    <div dir={dir} className="mx-auto max-w-3xl space-y-5 p-3 md:p-6">
      <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <p className="flex items-center gap-2 text-xs font-bold tracking-wider text-blue-600">
          <Clock3 className="h-4 w-4" aria-hidden />
          {t("employee.hoursPage.kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950 md:text-3xl">
          {t("employee.hoursPage.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("employee.hoursPage.subtitle")}</p>
      </header>

      {/* Today */}
      <section className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4 shadow-sm ring-1 ring-blue-200 md:p-5">
        <p className="text-xs font-black uppercase tracking-wider text-blue-700">
          {t("employee.hoursPage.todayTitle")}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TodayBox
            label={t("employee.hoursPage.firstIn")}
            value={fmtTime(today?.first_in ?? null)}
          />
          <TodayBox
            label={t("employee.hoursPage.lastOut")}
            value={
              liveSession
                ? t("employee.hoursPage.activeNow")
                : fmtTime(today?.last_out ?? null)
            }
            highlight={!!liveSession}
          />
          <TodayBox
            label={t("employee.hoursPage.totalHours")}
            value={fmtHMM(todayTotal)}
            big
          />
        </div>
        {today?.sessions.length ? (
          <ul className="mt-3 divide-y divide-blue-200/60 rounded-xl bg-white/70 px-3 py-2 text-xs">
            {today.sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5">
                <span className="font-mono tabular-nums text-slate-700">
                  {fmtTime(s.clock_in)} → {s.clock_out ? fmtTime(s.clock_out) : t("employee.hoursPage.activeNow")}
                </span>
                <span className="font-mono font-black tabular-nums text-slate-900">
                  {s.status === "ACTIVE"
                    ? fmtHMM(liveMinutes)
                    : fmtHMM(s.total_minutes ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* History */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden />
            {t("employee.hoursPage.historyTitle")}
          </h2>
          {days.length > 7 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-black text-blue-700 hover:underline"
            >
              {expanded
                ? t("employee.hoursPage.showLess")
                : t("employee.hoursPage.showMore")}
            </button>
          ) : null}
        </div>

        {visibleDays.length <= 1 ? (
          <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs font-bold text-slate-500">
            {t("employee.hoursPage.empty")}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-2 text-start font-black">
                    {t("employee.hoursPage.colDate")}
                  </th>
                  <th className="px-2 py-2 text-start font-black">
                    {t("employee.hoursPage.colIn")}
                  </th>
                  <th className="px-2 py-2 text-start font-black">
                    {t("employee.hoursPage.colOut")}
                  </th>
                  <th className="px-2 py-2 text-end font-black">
                    {t("employee.hoursPage.colTotal")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleDays.slice(1).map((d) => (
                  <tr key={d.work_date}>
                    <td className="px-2 py-2 font-bold text-slate-900">{d.work_date}</td>
                    <td className="px-2 py-2 font-mono tabular-nums text-slate-700">
                      {fmtTime(d.first_in)}
                    </td>
                    <td className="px-2 py-2 font-mono tabular-nums text-slate-700">
                      {fmtTime(d.last_out)}
                    </td>
                    <td className="px-2 py-2 text-end font-mono font-black tabular-nums text-slate-900">
                      {fmtHMM(d.total_minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TodayBox({
  label,
  value,
  big,
  highlight,
}: {
  label: string;
  value: string;
  big?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/85 p-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 font-mono tabular-nums ${
          big ? "text-2xl md:text-3xl" : "text-xl"
        } font-black ${highlight ? "text-emerald-600" : "text-slate-900"}`}
      >
        {value}
      </p>
    </div>
  );
}
