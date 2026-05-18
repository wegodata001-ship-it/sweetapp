"use client";

import { CheckCircle2, Clock3, Gauge } from "lucide-react";
import { formatMinutesHMM } from "@/lib/employee-experience/format-minutes";
import type { EmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
import { useI18n } from "@/components/i18n-provider";

type EmployeeProfileStripProps = {
  todayMinutes: number;
  stats: EmployeeTaskDayStats;
  className?: string;
};

export function EmployeeProfileStrip({
  todayMinutes,
  stats,
  className = "",
}: EmployeeProfileStripProps) {
  const { t } = useI18n();

  const items = [
    {
      icon: Clock3,
      label: t("employee.experience.profileHours"),
      value: formatMinutesHMM(todayMinutes),
    },
    {
      icon: CheckCircle2,
      label: t("employee.experience.profileTasks"),
      value: String(stats.completed),
    },
    {
      icon: Gauge,
      label: t("employee.experience.profileAvg"),
      value:
        stats.avgCompletedMinutes != null
          ? t("employee.experience.profileAvgValue", { minutes: stats.avgCompletedMinutes })
          : "—",
    },
  ];

  return (
    <div
      className={`grid grid-cols-3 gap-2 sm:gap-3 ${className}`}
      aria-label={t("employee.experience.profileLabel")}
    >
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="rounded-2xl border border-slate-200/90 bg-white px-2 py-3 text-center shadow-sm transition hover:border-blue-200/80 sm:px-3"
        >
          <Icon className="mx-auto h-4 w-4 text-[#2563eb]" aria-hidden />
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 text-sm font-black tabular-nums text-slate-900 sm:text-base">{value}</p>
        </div>
      ))}
    </div>
  );
}
