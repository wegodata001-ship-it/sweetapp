"use client";

import { ClipboardList } from "lucide-react";
import { useMemo } from "react";
import type { SerializedWorkEmployeeTask } from "@/lib/work-tasks/serialize-work-task";
import { useI18n } from "@/components/i18n-provider";

type EmployeeTasksSessionProps = {
  tasks: SerializedWorkEmployeeTask[];
  activeTask: SerializedWorkEmployeeTask | null;
};

export function EmployeeTasksSession({ tasks, activeTask }: EmployeeTasksSessionProps) {
  const { t } = useI18n();

  const { done, total, pct } = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((x) => x.status === "COMPLETED").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [tasks]);

  return (
    <section
      className="sticky top-0 z-20 -mx-3 border-b border-blue-200/60 bg-gradient-to-br from-[#2563eb]/10 via-white to-sky-50/90 px-3 py-4 shadow-[0_8px_32px_-12px_rgba(37,99,235,0.35)] backdrop-blur-md sm:-mx-4 sm:px-4 sm:py-5"
      aria-label={t("employee.tasks.sessionLabel")}
    >
      <div className="rounded-2xl border border-blue-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#2563eb]">
              <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
              {t("employee.tasks.sessionLabel")}
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950 sm:text-xl">
              {activeTask ? activeTask.title : t("employee.tasks.sessionIdle")}
            </h2>
            {activeTask?.estimated_minutes ? (
              <p className="mt-0.5 text-sm font-semibold text-slate-600">
                {t("employee.tasks.targetTime", { minutes: activeTask.estimated_minutes })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-600">
            <span>{t("employee.tasks.sessionProgress", { done, total })}</span>
            <span className="tabular-nums text-[#2563eb]">{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-sky-400 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
