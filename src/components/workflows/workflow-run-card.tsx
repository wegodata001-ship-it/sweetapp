"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Flag,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Timer,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useToast } from "@/components/toast-provider";
import {
  itemElapsedMs,
  itemIsLate,
} from "@/lib/workflows/run-helpers";
import type {
  WorkflowItemStatus,
  WorkflowRunDetailDto,
  WorkflowRunItemDto,
  WorkflowRunStatus,
} from "@/lib/workflows/serialize";

/**
 * Sequential workflow runner.
 *
 * Renders a run's items as step cards. Only one item is `ACTIVE` at a time;
 * Start is disabled until the previous item is completed. The timer always
 * derives from `started_at` so refreshing the browser preserves the elapsed
 * time. A single `setInterval` ticks the page once per second.
 *
 * Props:
 *  - run: the current run snapshot (parent loads/refetches).
 *  - canControl: whether the active user is allowed to start/complete items
 *    (the assignee, or a manager).
 *  - onChanged: called after each mutation so the parent can re-fetch.
 */
export function WorkflowRunCard({
  run,
  canControl,
  onChanged,
  employeeView = false,
}: {
  run: WorkflowRunDetailDto;
  canControl: boolean;
  onChanged?: () => void;
  /** פורטל עובד — לא להציג שם עובד אחר */
  employeeView?: boolean;
}) {
  const { t, dir } = useI18n();
  const { showToast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lateModal, setLateModal] = useState<{
    item: WorkflowRunItemDto;
    reason: string;
    submitting: boolean;
    error: string | null;
  } | null>(null);

  const hasActive = run.items.some((it) => it.status === "ACTIVE");
  const runRunning = run.status === "IN_PROGRESS";

  useEffect(() => {
    if (!runRunning || !hasActive) return;
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, [runRunning, hasActive]);

  const totals = useMemo(() => {
    const total = run.items.length;
    const done = run.items.filter((it) => it.status === "COMPLETED" || it.status === "SKIPPED").length;
    const late = run.items.filter((it) => it.is_late).length;
    return { total, done, late, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [run.items]);

  const callItem = useCallback(
    async (
      item: WorkflowRunItemDto,
      action: "start" | "complete" | "skip",
      lateReason?: string,
    ) => {
      setBusyId(item.id);
      try {
        const res = await fetch(
          `/api/workflows/runs/${encodeURIComponent(run.id)}/items/${encodeURIComponent(item.id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, lateReason: lateReason ?? null }),
            credentials: "same-origin",
          },
        );
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: WorkflowRunDetailDto }
          | { ok: false; code?: string; error?: string }
          | null;
        if (!json) {
          showToast({ tone: "error", title: t("workflows.runner.toast.serverError") });
          return null;
        }
        if (!json.ok) {
          if (json.code === "LATE_REASON_REQUIRED") {
            setLateModal({
              item,
              reason: "",
              submitting: false,
              error: json.error ?? null,
            });
            return null;
          }
          showToast({
            tone: "error",
            title: t("workflows.runner.toast.actionFailed"),
            description: json.error,
          });
          return null;
        }
        if (action === "start") {
          showToast({ tone: "info", title: t("workflows.runner.toast.started"), description: item.title });
        } else if (action === "complete") {
          showToast({
            tone: "success",
            title: t("workflows.runner.toast.completed"),
            description: item.title,
          });
        } else if (action === "skip") {
          showToast({ tone: "warning", title: t("workflows.runner.toast.skipped"), description: item.title });
        }
        onChanged?.();
        return json.data;
      } finally {
        setBusyId(null);
      }
    },
    [run.id, t, showToast, onChanged],
  );

  const submitLate = async () => {
    if (!lateModal) return;
    const reason = lateModal.reason.trim();
    if (!reason) {
      setLateModal({ ...lateModal, error: t("workflows.runner.lateReasonRequired") });
      return;
    }
    setLateModal({ ...lateModal, submitting: true, error: null });
    const result = await callItem(lateModal.item, "complete", reason);
    if (result) setLateModal(null);
    else setLateModal((prev) => (prev ? { ...prev, submitting: false } : prev));
  };

  return (
    <div className="relative" dir={dir}>
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
              {t("workflows.runner.runKicker")}
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950 md:text-xl">{run.title}</h2>
            <p className="mt-0.5 text-xs font-bold text-slate-600">
              {!employeeView && run.assignee_name ? `${run.assignee_name} · ` : null}
              {totals.done}/{totals.total} {t("workflows.runner.tasksSuffix")}
              {totals.late > 0 ? (
                <span className="ms-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800">
                  {t("workflows.runner.lateCount", { n: totals.late })}
                </span>
              ) : null}
            </p>
          </div>
          <RunStatusBadge status={run.status} />
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${
              run.status === "COMPLETED" ? "bg-emerald-500" : "bg-blue-500"
            }`}
            style={{ width: `${totals.pct}%` }}
            aria-hidden
          />
        </div>
      </header>

      <ol className="mt-3 space-y-2">
        {run.items.map((item) => {
          const elapsed = itemElapsedMs(item.started_at, item.completed_at, now);
          const live = item.status === "ACTIVE" ? itemIsLate(item.estimated_minutes, item.started_at, null, now) : item.is_late;
          const canStart =
            canControl &&
            run.status === "IN_PROGRESS" &&
            item.status === "PENDING" &&
            !hasActive &&
            !run.items.some(
              (other) =>
                other.order_index < item.order_index &&
                other.status !== "COMPLETED" &&
                other.status !== "SKIPPED",
            );
          const canComplete = canControl && item.status === "ACTIVE";
          return (
            <StepCard
              key={item.id}
              item={item}
              elapsedMs={elapsed}
              isLateLive={live}
              busy={busyId === item.id}
              canStart={canStart}
              canComplete={canComplete}
              onStart={() => callItem(item, "start")}
              onComplete={() => callItem(item, "complete")}
              onSkip={canControl ? () => callItem(item, "skip") : undefined}
            />
          );
        })}
      </ol>

      {lateModal ? (
        <LateReasonModal
          state={lateModal}
          onChange={(reason) =>
            setLateModal((prev) => (prev ? { ...prev, reason, error: null } : prev))
          }
          onSubmit={() => void submitLate()}
          onClose={() => setLateModal(null)}
        />
      ) : null}
    </div>
  );
}

function RunStatusBadge({ status }: { status: WorkflowRunStatus }) {
  const { t } = useI18n();
  if (status === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        {t("workflows.runner.statusCompleted")}
      </span>
    );
  }
  if (status === "ABORTED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">
        <XCircle className="h-3.5 w-3.5" aria-hidden />
        {t("workflows.runner.statusAborted")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
      <Play className="h-3.5 w-3.5" aria-hidden />
      {t("workflows.runner.statusInProgress")}
    </span>
  );
}

function StepCard({
  item,
  elapsedMs,
  isLateLive,
  busy,
  canStart,
  canComplete,
  onStart,
  onComplete,
  onSkip,
}: {
  item: WorkflowRunItemDto;
  elapsedMs: number | null;
  isLateLive: boolean;
  busy: boolean;
  canStart: boolean;
  canComplete: boolean;
  onStart: () => void;
  onComplete: () => void;
  onSkip?: () => void;
}) {
  const { t } = useI18n();
  const accent = item.color || "#64748b";
  const targetMs = item.estimated_minutes * 60_000;
  const remainingMs =
    item.status === "ACTIVE" && elapsedMs != null ? targetMs - elapsedMs : 0;

  const stateClasses = (() => {
    if (item.status === "COMPLETED") {
      return item.is_late
        ? "border-rose-300 bg-rose-50"
        : "border-emerald-300 bg-emerald-50";
    }
    if (item.status === "SKIPPED") return "border-slate-300 bg-slate-100";
    if (item.status === "ACTIVE") {
      return isLateLive
        ? "border-rose-500 bg-rose-50 shadow-[0_0_18px_rgba(244,63,94,0.25)]"
        : "border-blue-400 bg-blue-50 shadow-[0_0_18px_rgba(59,130,246,0.25)]";
    }
    return "border-slate-200 bg-white";
  })();

  return (
    <li className={`rounded-2xl border p-3 shadow-sm transition ${stateClasses}`}>
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: accent }}
          aria-hidden
        >
          <StatusIcon status={item.status} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950 md:text-base">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 text-xs text-slate-600">{item.description}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
              <Timer className="h-3 w-3" aria-hidden />
              {t("workflows.runner.targetMinutes", { n: item.estimated_minutes })}
            </span>
            {item.status !== "PENDING" && elapsedMs != null ? (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
                  isLateLive ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                <Timer className="h-3 w-3" aria-hidden />
                {formatMs(elapsedMs)}
              </span>
            ) : null}
            {item.is_late ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-rose-800">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t("workflows.runner.late")}
              </span>
            ) : null}
            {item.late_reason ? (
              <span
                className="max-w-[260px] truncate rounded-md bg-rose-50 px-2 py-0.5 text-rose-700"
                title={item.late_reason}
              >
                {item.late_reason}
              </span>
            ) : null}
            {item.actual_minutes != null && item.status === "COMPLETED" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                <Flag className="h-3 w-3" aria-hidden />
                {t("workflows.runner.actualMinutes", { n: item.actual_minutes })}
              </span>
            ) : null}
          </div>
        </div>

        {item.status === "ACTIVE" ? (
          <div className="ml-2 shrink-0 text-right">
            <CountdownPill
              targetMs={targetMs}
              remainingMs={remainingMs}
              isLate={isLateLive}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.status === "PENDING" ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {t("workflows.runner.actionStart")}
          </button>
        ) : null}
        {item.status === "ACTIVE" ? (
          <button
            type="button"
            onClick={onComplete}
            disabled={!canComplete || busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {t("workflows.runner.actionComplete")}
          </button>
        ) : null}
        {item.status !== "COMPLETED" && item.status !== "SKIPPED" && onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
            {t("workflows.runner.actionSkip")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: WorkflowItemStatus }) {
  if (status === "COMPLETED") return <Check className="h-5 w-5" aria-hidden />;
  if (status === "SKIPPED") return <ChevronRight className="h-5 w-5" aria-hidden />;
  if (status === "ACTIVE") return <Pause className="h-5 w-5" aria-hidden />;
  return <Circle className="h-5 w-5" aria-hidden />;
}

function CountdownPill({
  targetMs,
  remainingMs,
  isLate,
}: {
  targetMs: number;
  remainingMs: number;
  isLate: boolean;
}) {
  const display =
    targetMs <= 0
      ? "—"
      : isLate
        ? `+${formatMs(Math.abs(remainingMs))}`
        : formatMs(Math.max(0, remainingMs));
  return (
    <div
      className={`inline-flex flex-col items-center justify-center rounded-2xl px-3 py-1.5 ${
        isLate ? "bg-rose-600 text-white" : "bg-slate-900 text-white"
      }`}
      aria-live="polite"
    >
      <span className="text-[10px] font-bold uppercase opacity-80">
        {isLate ? "LATE" : "TIMER"}
      </span>
      <span className="text-base font-black tabular-nums leading-none md:text-xl">{display}</span>
    </div>
  );
}

function formatMs(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${String(h).padStart(2, "0")}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function LateReasonModal({
  state,
  onChange,
  onSubmit,
  onClose,
}: {
  state: { item: WorkflowRunItemDto; reason: string; submitting: boolean; error: string | null };
  onChange: (reason: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t, dir } = useI18n();
  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !state.submitting) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
          <h3 className="text-lg font-black text-slate-950">
            {t("workflows.runner.lateModalTitle")}
          </h3>
        </div>
        <p className="mt-2 text-sm font-bold text-slate-700">
          {t("workflows.runner.lateModalBody", { name: state.item.title })}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t("workflows.runner.lateModalHint", { n: state.item.estimated_minutes })}
        </p>
        <textarea
          value={state.reason}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          autoFocus
          placeholder={t("workflows.runner.lateModalPlaceholder")}
          className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
        />
        {state.error ? (
          <p className="mt-2 text-xs font-bold text-rose-700">{state.error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={state.submitting}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={state.submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            {state.submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            {t("workflows.runner.lateModalSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
