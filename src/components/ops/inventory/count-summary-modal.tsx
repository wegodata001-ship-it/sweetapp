"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Mail, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { CountSummaryEmailModal } from "./count-summary-email-modal";
import type { SummaryPreset } from "@/lib/inventory/count-summary-range";

/** מבנה התשובה של /api/inventory/count-summary — ללא שורות המוצרים */
export type CountSummaryLocation = {
  locationName: string;
  sessionCount: number;
  productCount: number;
  matchCount: number;
  shortageCount: number;
  surplusCount: number;
  totalCountedQty: number;
  addedCount: number;
  removedCount: number;
};

export type CountSummarySession = {
  sessionId: string;
  sessionNumber: number;
  locationName: string;
  countedByName: string;
  day: string;
  startedAt: string | null;
  endedAt: string;
  durationMinutes: number | null;
  productCount: number;
  status: string;
};

export type CountSummaryData = {
  from: string;
  to: string;
  isRange: boolean;
  generatedAt: string;
  sessionCount: number;
  locationsCounted: number;
  totals: {
    productsChecked: number;
    ok: number;
    shortage: number;
    surplus: number;
    anomalies: number;
    totalCountedQty: number;
    addedDuringCount: number;
    removedFromCount: number;
    totalDurationMinutes: number;
    avgDurationMinutes: number | null;
    sessionsWithDuration: number;
  };
  byLocation: CountSummaryLocation[];
  sessions: CountSummarySession[];
};

type Props = { open: boolean; onClose: () => void };

const PRESETS: SummaryPreset[] = ["today", "week", "month", "custom"];

export function CountSummaryModal({ open, onClose }: Props) {
  const { t, dir, bcp47 } = useI18n();
  const tS = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      t(`ops.inventory.summary.${key}`, vars),
    [t],
  );

  const [preset, setPreset] = useState<SummaryPreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<CountSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ preset });
    if (preset === "custom") {
      if (!customFrom || !customTo) return;
      params.set("from", customFrom);
      params.set("to", customTo);
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/count-summary?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; data?: CountSummaryData; error?: string };
      if (!res.ok || !j.ok || !j.data) {
        setError(j.error ?? tS("loadFailed"));
        setData(null);
        return;
      }
      setData(j.data);
    } catch {
      setError(tS("loadFailed"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, tS]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const fmtNumber = useCallback(
    (n: number) => new Intl.NumberFormat(bcp47).format(n),
    [bcp47],
  );

  const fmtDuration = useCallback(
    (minutes: number | null) => {
      if (minutes == null) return "—";
      if (minutes < 60) return tS("minutesValue", { n: fmtNumber(minutes) });
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return tS("hoursValue", { v: `${h}:${String(m).padStart(2, "0")}` });
    },
    [fmtNumber, tS],
  );

  const fmtDay = useCallback(
    (day: string) => {
      const [y, m, d] = day.split("-").map(Number);
      return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(bcp47, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    },
    [bcp47],
  );

  const fmtTime = useCallback(
    (iso: string | null) => {
      if (!iso) return "—";
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleTimeString(bcp47, { hour: "2-digit", minute: "2-digit" });
    },
    [bcp47],
  );

  const periodLabel = useMemo(() => {
    if (!data) return "";
    return data.isRange ? `${fmtDay(data.from)} – ${fmtDay(data.to)}` : fmtDay(data.from);
  }, [data, fmtDay]);

  if (!open) return null;

  const kpis = data
    ? [
        { key: "kpiSessions", value: fmtNumber(data.sessionCount), accent: "#6c4cff" },
        { key: "kpiLocations", value: fmtNumber(data.locationsCounted), accent: "#0ea5e9" },
        { key: "kpiProducts", value: fmtNumber(data.totals.productsChecked), accent: "#0f172a" },
        { key: "kpiOk", value: fmtNumber(data.totals.ok), accent: "#16a34a" },
        { key: "kpiShortage", value: fmtNumber(data.totals.shortage), accent: "#dc2626" },
        { key: "kpiSurplus", value: fmtNumber(data.totals.surplus), accent: "#d97706" },
        { key: "kpiAnomalies", value: fmtNumber(data.totals.anomalies), accent: "#dc2626" },
        { key: "kpiAdded", value: fmtNumber(data.totals.addedDuringCount), accent: "#0f172a" },
        { key: "kpiRemoved", value: fmtNumber(data.totals.removedFromCount), accent: "#0f172a" },
        {
          key: "kpiTotalTime",
          value: fmtDuration(data.totals.sessionsWithDuration ? data.totals.totalDurationMinutes : null),
          accent: "#0f172a",
        },
        {
          key: "kpiAvgTime",
          value: fmtDuration(data.totals.avgDurationMinutes),
          accent: "#0f172a",
        },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-[230] flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-md md:items-center md:p-4">
      <div
        className="flex h-[100dvh] w-full flex-col overflow-hidden rounded-none border border-[#e7ecf5] bg-[#f6f8fc] shadow-2xl md:h-[92dvh] md:max-w-6xl md:rounded-[24px]"
        role="dialog"
        aria-modal="true"
        dir={dir}
      >
        <header className="shrink-0 border-b border-[#e7ecf5] bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <BarChart3 className="h-5 w-5 shrink-0 text-[#6c4cff]" />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-slate-900">{tS("title")}</h3>
                <p className="truncate text-xs font-semibold text-slate-500">
                  {periodLabel || tS("subtitle")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setEmailOpen(true)}
                disabled={!data || data.sessionCount === 0}
                className="inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-xs font-black text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
                style={{ background: "#6c4cff" }}
              >
                <Mail className="h-4 w-4" />
                <span className="hidden sm:inline">{tS("sendEmail")}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100"
                aria-label={tS("close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`inline-flex h-9 items-center rounded-2xl border px-3 text-xs font-black transition ${
                  preset === p
                    ? "border-[#6c4cff] bg-[#6c4cff]/10 text-[#6c4cff]"
                    : "border-[#e7ecf5] bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tS(`preset.${p}`)}
              </button>
            ))}
            {preset === "custom" ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-semibold outline-none focus:border-[#6c4cff]"
                  aria-label={tS("from")}
                />
                <span className="text-xs font-black text-slate-400">–</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 rounded-2xl border border-[#e7ecf5] bg-white px-3 text-xs font-semibold outline-none focus:border-[#6c4cff]"
                  aria-label={tS("to")}
                />
              </div>
            ) : null}
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#6c4cff]" /> : null}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {error ? (
            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-700">
              {error}
            </p>
          ) : preset === "custom" && (!customFrom || !customTo) ? (
            <p className="py-10 text-center text-sm font-semibold text-slate-500">
              {tS("pickRange")}
            </p>
          ) : !data ? (
            <div className="flex justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-[#6c4cff]" />
            </div>
          ) : (
            <div className="space-y-5">
              <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {kpis.map((kpi) => (
                  <div
                    key={kpi.key}
                    className="rounded-[18px] border border-[#e7ecf5] bg-white px-3 py-3 shadow-sm"
                  >
                    <p className="text-[11px] font-bold text-slate-500">{tS(kpi.key)}</p>
                    <p className="mt-1 text-xl font-black" style={{ color: kpi.accent }}>
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </section>

              {data.sessionCount === 0 ? (
                <p className="rounded-[20px] border border-dashed border-[#e7ecf5] bg-white py-10 text-center text-sm font-semibold text-slate-500">
                  {tS("noCounts")}
                </p>
              ) : (
                <>
                  <section>
                    <h4 className="mb-2 text-sm font-black text-slate-900">{tS("byLocation")}</h4>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {data.byLocation.map((loc) => {
                        const clean = loc.shortageCount === 0 && loc.surplusCount === 0;
                        return (
                          <div
                            key={loc.locationName}
                            className="rounded-[18px] border border-[#e7ecf5] bg-white p-4 shadow-sm"
                          >
                            <p className="truncate text-sm font-black text-slate-900">
                              {loc.locationName}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {tS("locSessions", { n: fmtNumber(loc.sessionCount) })}
                            </p>
                            <p className="text-xs font-bold text-slate-500">
                              {tS("locProducts", { n: fmtNumber(loc.productCount) })}
                            </p>
                            {clean ? (
                              <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                                {tS("locNoAnomalies")}
                              </p>
                            ) : (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {loc.shortageCount > 0 ? (
                                  <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">
                                    {tS("locShortages", { n: fmtNumber(loc.shortageCount) })}
                                  </span>
                                ) : null}
                                {loc.surplusCount > 0 ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                                    {tS("locSurpluses", { n: fmtNumber(loc.surplusCount) })}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <h4 className="mb-2 text-sm font-black text-slate-900">{tS("sessionsDetail")}</h4>

                    {/* מובייל — כרטיס לכל ספירה במקום טבלה עם גלילה אופקית */}
                    <div className="grid gap-2 md:hidden">
                      {data.sessions.map((s) => (
                        <div
                          key={s.sessionId}
                          className="rounded-[18px] border border-[#e7ecf5] bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900">
                                {s.locationName}
                              </p>
                              <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                                #{fmtNumber(s.sessionNumber)} · {fmtDay(s.day)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                              {s.status === "COMPLETED" ? tS("statusCompleted") : s.status}
                            </span>
                          </div>
                          <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-700">
                            <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                              <dt className="text-[10px] text-slate-500">{tS("colStart")}</dt>
                              <dd className="font-black tabular-nums">{fmtTime(s.startedAt)}</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                              <dt className="text-[10px] text-slate-500">{tS("colEnd")}</dt>
                              <dd className="font-black tabular-nums">{fmtTime(s.endedAt)}</dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                              <dt className="text-[10px] text-slate-500">{tS("colDuration")}</dt>
                              <dd className="font-black tabular-nums">
                                {fmtDuration(s.durationMinutes)}
                              </dd>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-2 py-1.5">
                              <dt className="text-[10px] text-slate-500">{tS("colCountedBy")}</dt>
                              <dd className="truncate font-black">{s.countedByName}</dd>
                            </div>
                          </dl>
                        </div>
                      ))}
                    </div>

                    <div className="hidden overflow-x-auto rounded-[18px] border border-[#e7ecf5] bg-white md:block">
                      <table className="w-full min-w-[760px] text-start text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-[11px] font-black text-slate-500">
                            <th className="px-3 py-2 text-start">{tS("colNumber")}</th>
                            <th className="px-3 py-2 text-start">{tS("colDate")}</th>
                            <th className="px-3 py-2 text-start">{tS("colStart")}</th>
                            <th className="px-3 py-2 text-start">{tS("colEnd")}</th>
                            <th className="px-3 py-2 text-start">{tS("colDuration")}</th>
                            <th className="px-3 py-2 text-start">{tS("colCountedBy")}</th>
                            <th className="px-3 py-2 text-start">{tS("colLocation")}</th>
                            <th className="px-3 py-2 text-start">{tS("colStatus")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.sessions.map((s) => (
                            <tr key={s.sessionId} className="text-xs font-semibold text-slate-800">
                              <td className="px-3 py-2 font-black">{fmtNumber(s.sessionNumber)}</td>
                              <td className="px-3 py-2">{fmtDay(s.day)}</td>
                              <td className="px-3 py-2">{fmtTime(s.startedAt)}</td>
                              <td className="px-3 py-2">{fmtTime(s.endedAt)}</td>
                              <td className="px-3 py-2">{fmtDuration(s.durationMinutes)}</td>
                              <td className="px-3 py-2">{s.countedByName}</td>
                              <td className="px-3 py-2">{s.locationName}</td>
                              <td className="px-3 py-2">
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                                  {s.status === "COMPLETED" ? tS("statusCompleted") : s.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <CountSummaryEmailModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        initialPreset={preset}
        initialFrom={customFrom}
        initialTo={customTo}
      />
    </div>
  );
}
