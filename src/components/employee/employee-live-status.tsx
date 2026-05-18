"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { formatTimerMs } from "@/lib/tasks/timer-display";
import { useI18n } from "@/components/i18n-provider";

type EmployeeLiveStatusProps = {
  activeTask: SerializedWorkEmployeeTask | null;
  className?: string;
};

export function EmployeeLiveStatus({ activeTask, className = "" }: EmployeeLiveStatusProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeTask?.started_at) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeTask?.started_at, activeTask?.id]);

  const elapsedLabel = useMemo(() => {
    if (!activeTask?.started_at) return null;
    const start = new Date(activeTask.started_at).getTime();
    const mins = Math.max(1, Math.round((now - start) / 60_000));
    return t("employee.experience.liveElapsed", { minutes: mins });
  }, [activeTask?.started_at, now, t]);

  if (!activeTask) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-500 ${className}`}
      >
        {t("employee.experience.liveIdle")}
      </div>
    );
  }

  return (
    <div
      className={`wf-pulse rounded-2xl border border-[#2563eb]/30 bg-gradient-to-r from-blue-50/90 to-white px-4 py-3.5 shadow-sm ${className}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-sm">
          <Activity className="h-5 w-5 motion-safe:animate-pulse" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#2563eb]">
            {t("employee.experience.liveWorking")}
          </p>
          <p className="truncate text-lg font-black text-slate-950">{activeTask.title}</p>
          {elapsedLabel ? (
            <p className="mt-0.5 text-sm font-bold text-slate-600">{elapsedLabel}</p>
          ) : null}
        </div>
        {activeTask.started_at ? (
          <p className="font-mono text-2xl font-black tabular-nums text-[#2563eb] etask-timer-pulse">
            {formatTimerMs(Math.max(0, now - new Date(activeTask.started_at).getTime()))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
