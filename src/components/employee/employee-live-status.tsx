"use client";

import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { useI18n } from "@/components/i18n-provider";
import { TaskCountdownRing } from "@/components/tasks/task-countdown-ring";

type EmployeeLiveStatusProps = {
  activeTask: SerializedWorkEmployeeTask | null;
  className?: string;
};

export function EmployeeLiveStatus({ activeTask, className = "" }: EmployeeLiveStatusProps) {
  const { t } = useI18n();

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
      className={`rounded-2xl border border-[#0d2137]/20 bg-gradient-to-br from-[#071826] to-[#0f2744] px-4 py-4 shadow-md ${className}`}
      aria-live="polite"
    >
      <p className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.14em] text-emerald-400/90">
        {t("employee.experience.liveWorking")}
      </p>
      <TaskCountdownRing
        taskTitle={activeTask.title}
        estimatedMinutes={activeTask.estimated_minutes}
        startedAt={activeTask.started_at}
        completedAt={activeTask.completed_at}
        taskStatus={activeTask.status}
        size="compact"
        showMeta={false}
        showTitle
      />
    </div>
  );
}
