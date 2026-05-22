"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import premium from "@/components/dashboard/dashboard-premium.module.css";

type TasksChart = { onTime: number; late: number; early: number };

const COLORS = {
  onTime: { bar: "bg-emerald-500", label: "text-emerald-800" },
  late: { bar: "bg-rose-500", label: "text-rose-800" },
  early: { bar: "bg-blue-500", label: "text-blue-800" },
};

export function TasksPerformanceChart({ data }: { data: TasksChart }) {
  const { t } = useI18n();
  const total = data.onTime + data.late + data.early;

  const slices = useMemo(
    () => [
      { key: "onTime" as const, value: data.onTime, label: t("dashboard.redesign.tasksOnTime") },
      { key: "late" as const, value: data.late, label: t("dashboard.redesign.tasksLate") },
      { key: "early" as const, value: data.early, label: t("dashboard.redesign.tasksEarly") },
    ],
    [data, t],
  );

  return (
    <div className={`${premium.glassCard} p-3`}>
      <h2 className="text-[14px] font-black text-slate-900">{t("dashboard.redesign.chartTasks")}</h2>
      <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{t("dashboard.redesign.tasksPerformanceHint")}</p>
      <div className="mt-4 space-y-3">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          const c = COLORS[s.key];
          return (
            <div key={s.key}>
              <div className="mb-1 flex justify-between text-xs font-bold">
                <span className={c.label}>{s.label}</span>
                <span className="text-slate-700">
                  {s.value} <span className="text-slate-400">({pct}%)</span>
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${c.bar} transition-all duration-700 ease-out`}
                  style={{ width: `${total > 0 ? (s.value / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {total === 0 ? (
        <p className="mt-3 text-center text-xs font-semibold text-slate-400">{t("dashboard.redesign.noTaskData")}</p>
      ) : null}
    </div>
  );
}
