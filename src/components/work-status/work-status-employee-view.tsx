"use client";

import { Check, Loader2, Play, Radio } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { WorkStatusHeartbeat } from "@/components/work-status/work-status-heartbeat";
import { formatElapsedMs } from "@/lib/work-status/presence";

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
    description: string | null;
    materials: string | null;
    taskGroup: { title: string; color: string | null } | null;
  } | null;
  next_task: { id: string; title: string } | null;
};

const POLL_MS = 15_000;

export function WorkStatusEmployeeView() {
  const { t, dir } = useI18n();
  const [data, setData] = useState<MeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

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
  const elapsed =
    task?.startedAt && task.status === "IN_PROGRESS"
      ? formatElapsedMs(Date.now() - new Date(task.startedAt).getTime())
      : "00:00";

  const startTask = async (taskId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}/start`, {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) alert(j.error ?? t("common.error"));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const completeTask = async (taskId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) alert(j.error ?? t("common.error"));
      await load();
    } finally {
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
          <p className="mt-3 font-mono text-3xl font-black tabular-nums text-violet-700">{elapsed}</p>
          <p className="text-xs font-bold text-slate-500">
            ⏱ {task.estimatedMinutes} {t("workStatus.minutes")}
          </p>
          {task.description ? <p className="mt-3 text-sm text-slate-700">{task.description}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void completeTask(task.id)}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-5 w-5" />}
            {t("workflows.page.steps.complete")}
          </button>
        </article>
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
    </div>
  );
}
