"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import { areaUnderPath, smoothLinePath } from "@/components/dashboard/chart-utils";

type Point = {
  date: string;
  label: string;
  income: number;
  expenses: number;
  profit: number;
};

const W = 400;
const H = 160;
const PAD = 8;

export function ProfitAnalyticsChart({ data }: { data: Point[] }) {
  const { t } = useI18n();

  const { incomePath, expensePath, profitPath, maxY } = useMemo(() => {
    const maxY = Math.max(
      1,
      ...data.flatMap((d) => [d.income, d.expenses, Math.abs(d.profit)]),
    );
    const norm = (vals: number[]) => vals.map((v) => v / maxY);
    return {
      maxY,
      incomePath: smoothLinePath(
        norm(data.map((d) => d.income)),
        W,
        H,
        PAD,
      ),
      expensePath: smoothLinePath(
        norm(data.map((d) => d.expenses)),
        W,
        H,
        PAD,
      ),
      profitPath: smoothLinePath(
        norm(data.map((d) => Math.max(0, d.profit))),
        W,
        H,
        PAD,
      ),
    };
  }, [data]);

  const incomeArea = areaUnderPath(incomePath, W, H);
  const expenseArea = areaUnderPath(expensePath, W, H);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="erp-section-title">{t("dashboard.redesign.chartProfit")}</h2>
        <span className="text-xs font-bold text-slate-500">{t("dashboard.redesign.chartDaily")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-40 w-full" role="img" aria-label={t("dashboard.chartTitle")}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={incomeArea} fill="url(#incomeGrad)" />
        <path d={expenseArea} fill="url(#expenseGrad)" opacity={0.7} />
        <path d={incomePath} fill="none" stroke="#10b981" strokeWidth="2.5" />
        <path d={expensePath} fill="none" stroke="#f43f5e" strokeWidth="2.5" />
        <path d={profitPath} fill="none" stroke="#eab308" strokeWidth="2" strokeDasharray="4 3" />
      </svg>
      <div className="mt-2 flex justify-between gap-1 overflow-x-auto text-[10px] font-bold text-slate-500">
        {data.map((d) => (
          <span key={d.date} className="shrink-0 px-0.5">
            {d.label}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-slate-600">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-emerald-500" /> {t("dashboard.chartLegendIncome")}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-rose-500" /> {t("dashboard.chartLegendExpenses")}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-yellow-500" /> {t("dashboard.chartLegendProfit")}
        </span>
      </div>
      <p className="sr-only">
        max {formatShekel(maxY)}
      </p>
    </div>
  );
}
