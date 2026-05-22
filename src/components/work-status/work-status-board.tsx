"use client";

import { Activity, Loader2, Radio, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { WorkStatusHeartbeat } from "@/components/work-status/work-status-heartbeat";
import type { WorkStatusBoardRow } from "@/lib/work-status/board-service";
import { formatElapsedMs, type WorkPresenceState } from "@/lib/work-status/presence";

type BoardPayload = {
  rows: WorkStatusBoardRow[];
  stats: { total: number; online: number; working: number };
};

const POLL_MS = 15_000;

const PRESENCE_RING: Record<WorkPresenceState, string> = {
  WORKING: "ring-emerald-400/80 shadow-[0_0_20px_rgba(52,211,153,0.45)]",
  LATE: "ring-red-400/80 shadow-[0_0_20px_rgba(248,113,113,0.45)]",
  IDLE: "ring-amber-300/70 shadow-[0_0_16px_rgba(251,191,36,0.35)]",
  ONLINE: "ring-emerald-300/50",
  OFFLINE: "ring-slate-200 opacity-70",
};

const PRESENCE_DOT: Record<WorkPresenceState, string> = {
  WORKING: "bg-emerald-500",
  LATE: "bg-red-500",
  IDLE: "bg-amber-400",
  ONLINE: "bg-emerald-400",
  OFFLINE: "bg-slate-300",
};

function presenceLabel(t: (k: string) => string, p: WorkPresenceState) {
  return t(`workStatus.presence.${p.toLowerCase()}`);
}

export function WorkStatusBoard() {
  const { t, dir } = useI18n();
  const [data, setData] = useState<BoardPayload | null>(null);
  const [selected, setSelected] = useState<WorkStatusBoardRow | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/work-status/board", { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; data?: BoardPayload };
    if (j.ok && j.data) setData(j.data);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const p = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      clearInterval(p);
      clearInterval(clock);
    };
  }, [load]);

  const liveElapsed = (startedAt: string | null) => {
    void tick;
    if (!startedAt) return "00:00";
    return formatElapsedMs(Date.now() - new Date(startedAt).getTime());
  };

  const rows = data?.rows ?? [];

  return (
    <div dir={dir} className="ws-board min-h-[70vh] pb-8">
      <WorkStatusHeartbeat />

      <header className="ws-hero rounded-2xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-200">
          <Radio className="h-4 w-4 animate-pulse" />
          {t("workStatus.board.kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{t("workStatus.board.title")}</h1>
        <p className="mt-2 text-sm font-bold text-white/75">{t("workStatus.board.subtitle")}</p>
        {data ? (
          <div className="mt-4 flex flex-wrap gap-3 text-xs font-black">
            <span className="rounded-full bg-white/15 px-3 py-1 text-white">
              {t("workStatus.board.statsOnline")}: {data.stats.online}
            </span>
            <span className="rounded-full bg-emerald-500/30 px-3 py-1 text-emerald-100">
              {t("workStatus.board.statsWorking")}: {data.stats.working}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
              {t("workStatus.board.statsTotal")}: {data.stats.total}
            </span>
          </div>
        ) : null}
      </header>

      {!data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <button
              key={row.user_id}
              type="button"
              onClick={() => setSelected(row)}
              className={`rounded-2xl bg-white p-4 text-start ring-2 transition hover:scale-[1.01] ${PRESENCE_RING[row.presence]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-black text-slate-950">{row.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className={`h-2 w-2 rounded-full ${PRESENCE_DOT[row.presence]}`} />
                    {presenceLabel(t, row.presence)}
                  </p>
                </div>
                <Activity className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
              {row.active_task ? (
                <div
                  className="mt-3 rounded-xl border-s-4 bg-slate-50 p-3"
                  style={row.active_task.color ? { borderColor: row.active_task.color } : { borderColor: "#8b5cf6" }}
                >
                  <p className="text-[10px] font-black uppercase text-emerald-700">
                    {t("workStatus.board.nowOn")}
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-900">{row.active_task.title}</p>
                  {row.active_task.group_title ? (
                    <p className="mt-1 text-xs font-bold text-slate-600">📦 {row.active_task.group_title}</p>
                  ) : null}
                  <p className="mt-2 font-mono text-lg font-black tabular-nums text-violet-700">
                    ⏱ {liveElapsed(row.active_task.started_at)}
                  </p>
                  <p className="text-[11px] font-bold text-slate-500">
                    📊 {row.active_task.step_index}/{row.active_task.step_total}
                  </p>
                </div>
              ) : row.presence !== "OFFLINE" ? (
                <p className="mt-3 text-xs font-bold text-slate-500">{t("workStatus.board.noActiveTask")}</p>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">{selected.name}</h2>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${PRESENCE_DOT[selected.presence]}`} />
                  {presenceLabel(t, selected.presence)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selected.active_task ? (
              <article
                className="mt-4 rounded-2xl border-s-4 bg-gradient-to-br from-violet-50 to-white p-4"
                style={
                  selected.active_task.color
                    ? { borderColor: selected.active_task.color }
                    : { borderColor: "#7c3aed" }
                }
              >
                <p className="text-xs font-black uppercase text-emerald-700">{t("workStatus.board.liveTask")}</p>
                <h3 className="mt-2 text-lg font-black">{selected.active_task.title}</h3>
                {selected.active_task.group_title ? (
                  <p className="mt-2 text-sm font-bold text-slate-600">
                    📦 {t("workStatus.group")}: {selected.active_task.group_title}
                  </p>
                ) : null}
                <p className="mt-2 font-mono text-3xl font-black text-violet-700">
                  {liveElapsed(selected.active_task.started_at)}
                </p>
                <p className="text-sm font-bold text-slate-600">
                  📍 {t("workStatus.step")} {selected.active_task.step_index} / {selected.active_task.step_total}
                </p>
                {selected.active_task.description ? (
                  <p className="mt-3 text-sm text-slate-700">{selected.active_task.description}</p>
                ) : null}
                {selected.active_task.materials ? (
                  <p className="mt-2 text-sm text-slate-600">📝 {selected.active_task.materials}</p>
                ) : null}
              </article>
            ) : (
              <p className="mt-4 text-sm font-bold text-slate-500">{t("workStatus.board.noActiveTask")}</p>
            )}

            {selected.timeline.length > 0 ? (
              <div className="mt-5">
                <p className="text-xs font-black uppercase text-slate-500">{t("workStatus.board.timeline")}</p>
                <ul className="mt-2 space-y-2 border-s-2 border-slate-100 ps-3">
                  {selected.timeline.map((ev) => (
                    <li key={ev.at + ev.label} className="relative text-sm">
                      <span className="font-mono text-[11px] font-bold text-violet-600">
                        {new Date(ev.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="ms-2 font-semibold text-slate-800">{ev.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
