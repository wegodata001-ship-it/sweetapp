"use client";

import { Check, Loader2, Play, Radio } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { CompleteTaskModal } from "@/components/tasks/complete-task-modal";
import { WorkStatusHeartbeat } from "@/components/work-status/work-status-heartbeat";
import {
  describeLateness,
  formatTaskDateTime,
  taskDeadlineAt,
} from "@/lib/tasks/completion";
import { TASK_BLOCK_REASONS, activeWorkMs, formatClockHms, isWorkLate } from "@/lib/work-tasks/task-timing";

type MeData = {
  name: string;
  presence: string;
  active_task: {
    id: string;
    title: string;
    status: string;
    color: string | null;
    estimatedMinutes: number;
    startedAt: string | null;
    activeWorkMs?: number;
    segmentStartedAt?: string | null;
    delayReason?: string | null;
    description: string | null;
    materials: string | null;
    taskGroup: { title: string; color: string | null } | null;
  } | null;
  next_task: { id: string; title: string } | null;
  delayed_tasks?: Array<{ id: string; title: string; delayReason: string | null }>;
};

const POLL_MS = 15_000;

export function WorkStatusEmployeeView() {
  const { t, dir, bcp47 } = useI18n();
  const [data, setData] = useState<MeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayChoice, setDelayChoice] = useState("");
  const [lateReason, setLateReason] = useState("");
  const [completionNote, setCompletionNote] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/work-status/me", { credentials: "same-origin", cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; data?: MeData };
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

  const task = data?.active_task;
  const workedMs = task
    ? activeWorkMs({
        activeWorkMs: task.activeWorkMs ?? 0,
        segmentStartedAt: task.segmentStartedAt ?? task.startedAt,
        status: task.status,
        nowMs: Date.now(),
      })
    : 0;
  const targetMs = (task?.estimatedMinutes ?? 0) * 60_000;
  const elapsed = formatClockHms(workedMs);
  const targetClock = formatClockHms(targetMs);
  const lateClock = workedMs > targetMs ? formatClockHms(workedMs - targetMs) : "";

  const startTask = async (taskId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}/start`, {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: { id: string; title: string; status: string; estimated_minutes: number; started_at: string | null; active_work_ms: number; segment_started_at: string | null; description: string | null };
      };
      if (!j.ok || !j.data) {
        alert(j.error ?? t("common.error"));
      } else {
        const row = j.data;
        setData((current) =>
          current
            ? {
                ...current,
                active_task: {
                  id: row.id,
                  title: row.title,
                  status: row.status,
                  color: current.active_task?.color ?? null,
                  estimatedMinutes: row.estimated_minutes,
                  startedAt: row.started_at,
                  activeWorkMs: row.active_work_ms,
                  segmentStartedAt: row.segment_started_at,
                  description: row.description,
                  materials: current.active_task?.materials ?? null,
                  taskGroup: current.active_task?.taskGroup ?? null,
                },
                delayed_tasks: (current.delayed_tasks ?? []).filter((item) => item.id !== row.id),
                next_task: current.next_task?.id === row.id ? null : current.next_task,
              }
            : current,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const completeTask = async () => {
    if (!task || submitting) return;
    const late = isWorkLate(workedMs, task.estimatedMinutes);
    const reason = lateReason.trim();
    if (late && !reason) {
      setCompleteError(t("completeTask.lateReasonRequiredHint"));
      return;
    }
    setSubmitting(true);
    setBusy(true);
    setCompleteError(null);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(task.id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(late ? { late_reason: reason } : {}),
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        nextTask?: { id: string; title: string } | null;
      };
      if (!j.ok) {
        setCompleteError(j.error ?? t("completeTask.failed"));
        return;
      }
      setCompleteOpen(false);
      setLateReason("");
      setCompletionNote("");
      setData((current) =>
        current
          ? {
              ...current,
              active_task: null,
              next_task: j.nextTask ? { id: j.nextTask.id, title: j.nextTask.title } : null,
            }
          : current,
      );
    } catch {
      setCompleteError(t("completeTask.failed"));
    } finally {
      setSubmitting(false);
      setBusy(false);
    }
  };

  void tick;

  return (
    <div dir={dir} className="ws-employee min-h-[70vh]">
      <WorkStatusHeartbeat />

      <header className="ws-hero rounded-2xl px-4 py-5 sm:px-6 sm:py-6">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-200">
          <Radio className="h-4 w-4" />
          {t("workStatus.employee.kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{data?.name ?? "—"}</h1>
        <p className="mt-1 text-sm font-bold text-white/80">{t("workStatus.employee.subtitle")}</p>
      </header>

      {!data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      ) : task && task.status === "IN_PROGRESS" ? (
        <>
        <article
          className="mt-4 rounded-2xl bg-white p-4 shadow-lg ring-2 sm:p-6"
          style={task.color ? { borderColor: task.color, boxShadow: `0 0 24px ${task.color}44` } : undefined}
        >
          <p className="text-xs font-black uppercase text-emerald-600">{t("workStatus.employee.nowWorking")}</p>
          <h2 className="mt-2 text-xl font-black text-slate-950 sm:text-2xl">{task.title}</h2>
          {task.taskGroup ? (
            <p className="mt-1 text-sm font-bold text-slate-600">
              📦 {task.taskGroup.title}
            </p>
          ) : null}
          <p className="mt-3 text-xs font-bold text-slate-500">{t("taskTiming.target")}</p>
          <p className="font-mono text-2xl font-black tabular-nums text-slate-800">{targetClock}</p>
          <p className="mt-2 text-xs font-bold text-slate-500">{t("taskTiming.worked")}</p>
          <p className="font-mono text-3xl font-black tabular-nums text-violet-700">{elapsed}</p>
          {lateClock ? <p className="mt-1 font-mono text-sm font-black tabular-nums text-rose-700">{t("taskTiming.lateBy")} {lateClock}</p> : null}
          {task.description ? <p className="mt-3 text-sm text-slate-700">{task.description}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => setDelayOpen(true)}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-xl border border-amber-300 text-sm font-black text-amber-900"
          >
            {t("taskTiming.delay")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setCompleteOpen(true);
              setCompleteError(null);
            }}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}
            {t("workflows.page.steps.complete")}
          </button>
        </article>
        {(data.delayed_tasks ?? []).map((row) => (
          <article key={row.id} className="mt-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="text-xs font-black text-amber-800">{t("taskTiming.delayedBadge")}</p>
            <h2 className="mt-1 text-lg font-black">{row.title}</h2>
            <p className="mt-1 text-sm font-bold">{t("taskTiming.reasonLabel")}: {row.delayReason ? t(`taskTiming.reason.${row.delayReason}`) : "—"}</p>
            <p className="mt-2 text-xs font-bold text-slate-600">{t("taskTiming.resumeBlocked")}</p>
          </article>
        ))}
        </>
      ) : data.delayed_tasks && data.delayed_tasks.length > 0 ? (
        <div className="mt-4 space-y-3">
          {data.delayed_tasks.map((row) => (
            <article key={row.id} className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <p className="text-xs font-black text-amber-800">{t("taskTiming.delayedBadge")}</p>
              <h2 className="mt-1 text-lg font-black">{row.title}</h2>
              <p className="mt-1 text-sm font-bold">{t("taskTiming.reasonLabel")}: {row.delayReason ? t(`taskTiming.reason.${row.delayReason}`) : "—"}</p>
              <button type="button" disabled={busy} onClick={() => void startTask(row.id)} className="mt-3 h-12 w-full rounded-xl bg-blue-600 text-sm font-black text-white">
                {t("taskTiming.resume")}
              </button>
            </article>
          ))}
          {data.next_task ? (
            <button type="button" disabled={busy} onClick={() => void startTask(data.next_task!.id)} className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-black text-white">
              {t("workflows.page.steps.start")}: {data.next_task.title}
            </button>
          ) : null}
        </div>
      ) : data.next_task ? (
        <article className="mt-4 rounded-2xl bg-white p-4 shadow-md ring-1 ring-slate-200 sm:p-6">
          <p className="text-xs font-black text-slate-500">{t("workStatus.employee.nextTask")}</p>
          <h2 className="mt-2 text-lg font-black text-slate-950">{data.next_task.title}</h2>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startTask(data.next_task!.id)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white"
          >
            <Play className="h-5 w-5" />
            {t("workflows.page.steps.start")}
          </button>
        </article>
      ) : (
        <p className="mt-8 text-center text-sm font-bold text-slate-500">{t("workStatus.employee.noTask")}</p>
      )}

      {delayOpen ? (
        <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-3 sm:items-center" role="dialog">
          <div className="w-full max-w-sm rounded-3xl bg-white p-4">
            <h3 className="text-lg font-black">{t("taskTiming.delayTitle")}</h3>
            <p className="mt-1 text-sm font-bold text-slate-600">{t("taskTiming.whyNow")}</p>
            <div className="mt-3 space-y-2">
              {TASK_BLOCK_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2 text-sm font-bold">
                  <input type="radio" checked={delayChoice === reason} onChange={() => setDelayChoice(reason)} />
                  {t(`taskTiming.reason.${reason}`)}
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={!delayChoice || busy}
                className="flex-1 rounded-xl bg-amber-500 py-2 text-sm font-black disabled:opacity-50"
                onClick={() => {
                  if (!task) return;
                  setBusy(true);
                  void fetch(`/api/work/tasks/${encodeURIComponent(task.id)}/delay`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ reason: delayChoice }),
                  }).then(async (res) => {
                    const j = (await res.json()) as {
                      ok?: boolean;
                      error?: string;
                      data?: { id: string; title: string; delay_reason: string | null };
                      nextTask?: { id: string; title: string } | null;
                    };
                    if (!j.ok || !j.data) {
                      alert(j.error ?? t("common.error"));
                    } else {
                      const delayed = j.data;
                      setData((current) =>
                        current
                          ? {
                              ...current,
                              active_task: null,
                              next_task: j.nextTask ? { id: j.nextTask.id, title: j.nextTask.title } : current.next_task,
                              delayed_tasks: [
                                ...(current.delayed_tasks ?? []).filter((item) => item.id !== delayed.id),
                                { id: delayed.id, title: delayed.title, delayReason: delayed.delay_reason },
                              ],
                            }
                          : current,
                      );
                    }
                    setDelayOpen(false);
                    setDelayChoice("");
                    setBusy(false);
                  });
                }}
              >
                {t("taskTiming.delayAndNext")}
              </button>
              <button type="button" className="rounded-xl px-3 text-sm font-bold" onClick={() => setDelayOpen(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      ) : null}

      {task && completeOpen ? (
        <CompleteTaskModal
          open
          task={{
            title: task.title,
            dueLabel: formatTaskDateTime(
              taskDeadlineAt({
                startedAt: task.startedAt,
                estimatedMinutes: task.estimatedMinutes,
              }),
              bcp47,
            ),
            statusLabel: t("completeTask.statusInProgress"),
            isLate: isWorkLate(workedMs, task.estimatedMinutes),
            lateParts: describeLateness({
              startedAt: task.startedAt,
              estimatedMinutes: task.estimatedMinutes,
            }),
            completeAtLabel: formatTaskDateTime(new Date(), bcp47),
          }}
          lateReason={lateReason}
          completionNote={completionNote}
          submitting={submitting}
          error={completeError}
          requireLateReason={isWorkLate(workedMs, task.estimatedMinutes)}
          showCompletionNote={false}
          reasonChoices={TASK_BLOCK_REASONS.map((value) => ({ value, label: t(`taskTiming.reason.${value}`) }))}
          clockSummary={{ target: targetClock, actual: elapsed, late: lateClock || "00:00:00" }}
          onLateReasonChange={(v) => {
            setLateReason(v);
            setCompleteError(null);
          }}
          onCompletionNoteChange={setCompletionNote}
          onCancel={() => {
            if (!submitting) setCompleteOpen(false);
          }}
          onSubmit={() => void completeTask()}
        />
      ) : null}
    </div>
  );
}
