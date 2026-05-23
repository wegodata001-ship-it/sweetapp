"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Hammer,
  HardHat,
  Landmark,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import type { ExpenseCategoryMetrics } from "@/lib/dashboard/financial-engine";
import type { DashboardTimeRange } from "@/lib/dashboard/time-range";
import { DashboardTimeFilter } from "@/components/dashboard/dashboard-time-filter";
import { smoothLinePath } from "@/components/dashboard/chart-utils";
import fade from "@/components/dashboard/section-fade.module.css";
import premium from "@/components/dashboard/dashboard-premium.module.css";

const STYLES: Record<
  ExpenseCategoryMetrics["type"],
  { icon: LucideIcon; accent: string; bg: string; line: string }
> = {
  SUPPLIER_PAYMENTS: { icon: Building2, accent: "text-blue-600", bg: "from-blue-500/10 to-blue-50", line: "#3b82f6" },
  DAILY_PAYMENTS: { icon: Landmark, accent: "text-orange-600", bg: "from-orange-500/10 to-orange-50", line: "#f97316" },
  WORKER_PAYMENTS: { icon: HardHat, accent: "text-emerald-600", bg: "from-emerald-500/10 to-emerald-50", line: "#10b981" },
  EXTERNAL_PAYMENTS: { icon: Hammer, accent: "text-violet-600", bg: "from-violet-500/10 to-violet-50", line: "#8b5cf6" },
  INVESTMENTS: { icon: Sparkles, accent: "text-amber-700", bg: "from-amber-500/15 to-amber-50", line: "#d4a017" },
};

const LABEL_KEYS: Record<ExpenseCategoryMetrics["type"], string> = {
  SUPPLIER_PAYMENTS: "dashboard.redesign.expenseSupplier",
  DAILY_PAYMENTS: "dashboard.redesign.expenseDaily",
  WORKER_PAYMENTS: "dashboard.redesign.expenseWorkers",
  EXTERNAL_PAYMENTS: "dashboard.redesign.expenseExternal",
  INVESTMENTS: "dashboard.redesign.expenseDev",
};

const PERIOD_LABEL_KEYS: Record<DashboardTimeRange, string> = {
  today: "dashboard.redesign.today",
  week: "dashboard.redesign.week",
  month: "dashboard.redesign.filter.month",
};

function amountForRange(card: ExpenseCategoryMetrics, range: DashboardTimeRange): number {
  if (range === "today") return card.today;
  if (range === "week") return card.week;
  return card.month;
}

export function ExpenseCategoryCards({ cards }: { cards: ExpenseCategoryMetrics[] }) {
  const { t } = useI18n();
  const [range, setRange] = useState<DashboardTimeRange>("today");

  const displayCards = useMemo(
    () =>
      cards.map((card) => ({
        ...card,
        periodAmount: amountForRange(card, range),
      })),
    [cards, range],
  );

  return (
    <div className={`${premium.glassCard} flex h-full min-h-0 flex-col p-2.5`}>
      <div className="mb-2 border-b border-slate-100 pb-2">
        <h2 className="font-arabic-brand text-[13px] font-black text-slate-800">
          {t("dashboard.redesign.sectionExpenses")}
        </h2>
        <DashboardTimeFilter value={range} onChange={setRange} variant="expense" />
      </div>
      <div
        key={range}
        className={`grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:grid-rows-1 ${fade.fade}`}
      >
        {displayCards.map((card) => {
          const style = STYLES[card.type];
          const Icon = style.icon;
          const path = smoothLinePath(card.sparkline, 64, 22, 2);
          const pct = card.changePctWeek;
          const up = pct != null && pct > 0;

          return (
            <div
              key={card.type}
              className={`flex min-h-[118px] flex-col rounded-xl border border-slate-200/60 bg-gradient-to-br ${style.bg} p-2 transition duration-300 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80 ${style.accent}`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className={`text-[10px] font-bold ${up ? "text-rose-600" : "text-emerald-600"}`}>
                  {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct}%`}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] font-bold leading-tight text-slate-600">
                {t(LABEL_KEYS[card.type])}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {t(PERIOD_LABEL_KEYS[range])}:{" "}
                <span className="text-sm font-black text-slate-900">{formatShekel(card.periodAmount)}</span>
              </p>
              <svg viewBox="0 0 64 22" className="mt-auto h-5 w-full opacity-75" aria-hidden>
                <path d={path} fill="none" stroke={style.line} strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
