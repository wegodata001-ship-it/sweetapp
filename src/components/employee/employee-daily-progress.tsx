"use client";

import type { EmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import { useI18n } from "@/components/i18n-provider";

type EmployeeDailyProgressProps = {
  stats: EmployeeTaskDayStats;
  className?: string;
};

export function EmployeeDailyProgress({ stats, className = "" }: EmployeeDailyProgressProps) {
  const { t } = useI18n();

  if (stats.total === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ${className}`}
      aria-label={t("employee.experience.dailyProgressLabel")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-800">{t("employee.experience.dailyProgressTitle")}</p>
        <span className="text-sm font-black tabular-nums text-[#2563eb]">{stats.progressPct}%</span>
      </div>
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {t("employee.experience.dailyProgressLine", {
          done: stats.completed,
          total: stats.total,
        })}
      </p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2563eb] via-sky-400 to-[#16a34a] transition-[width] duration-700 ease-out"
          style={{ width: `${stats.progressPct}%` }}
        />
      </div>
    </section>
  );
}
