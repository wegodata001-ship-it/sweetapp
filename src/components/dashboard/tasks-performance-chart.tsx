"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { donutSegments } from "@/components/dashboard/chart-utils";

type TasksChart = { onTime: number; late: number; early: number };

export function TasksPerformanceChart({ data }: { data: TasksChart }) {
  const { t } = useI18n();
  const total = data.onTime + data.late + data.early;

  const segments = useMemo(
    () =>
      donutSegments([
        { value: data.onTime, color: "#10b981" },
        { value: data.late, color: "#f43f5e" },
        { value: data.early, color: "#3b82f6" },
      ]),
    [data],
  );

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <h2 className="erp-section-title">{t("dashboard.redesign.chartTasks")}</h2>
      <div className="mt-4 flex items-center justify-center gap-6">
        <svg viewBox="0 0 100 100" className="h-36 w-36">
          {segments.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} className="transition-opacity hover:opacity-90" />
          ))}
          <circle cx="50" cy="50" r="22" fill="white" />
          <text x="50" y="54" textAnchor="middle" className="fill-slate-800 text-[11px] font-bold">
            {total}
          </text>
        </svg>
        <ul className="space-y-2 text-sm font-bold text-slate-700">
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            {t("dashboard.redesign.tasksOnTime")} ({data.onTime})
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            {t("dashboard.redesign.tasksLate")} ({data.late})
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            {t("dashboard.redesign.tasksEarly")} ({data.early})
          </li>
        </ul>
      </div>
    </div>
  );
}
