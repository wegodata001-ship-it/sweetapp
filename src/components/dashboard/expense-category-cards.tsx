"use client";

import {
  Building2,
  Hammer,
  HardHat,
  Landmark,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";
import type { ExpenseCategoryKey } from "@/lib/dashboard/summary";
import { smoothLinePath } from "@/components/dashboard/chart-utils";

const STYLES: Record<
  ExpenseCategoryKey,
  { icon: LucideIcon; gradient: string; ring: string; line: string }
> = {
  SUPPLIER_PAYMENTS: {
    icon: Building2,
    gradient: "from-blue-50 to-blue-100/60",
    ring: "bg-blue-500/15 text-blue-700",
    line: "#3b82f6",
  },
  DAILY_PAYMENTS: {
    icon: Landmark,
    gradient: "from-orange-50 to-amber-100/50",
    ring: "bg-orange-500/15 text-orange-700",
    line: "#f97316",
  },
  WORKER_PAYMENTS: {
    icon: HardHat,
    gradient: "from-emerald-50 to-green-100/50",
    ring: "bg-emerald-500/15 text-emerald-700",
    line: "#10b981",
  },
  EXTERNAL_PAYMENTS: {
    icon: Hammer,
    gradient: "from-violet-50 to-purple-100/50",
    ring: "bg-violet-500/15 text-violet-700",
    line: "#8b5cf6",
  },
  INVESTMENTS: {
    icon: Sparkles,
    gradient: "from-amber-50 to-yellow-100/60",
    ring: "bg-amber-500/20 text-amber-800",
    line: "#d4a017",
  },
};

const LABEL_KEYS: Record<ExpenseCategoryKey, string> = {
  SUPPLIER_PAYMENTS: "dashboard.redesign.expenseSupplier",
  DAILY_PAYMENTS: "dashboard.redesign.expenseDaily",
  WORKER_PAYMENTS: "dashboard.redesign.expenseWorkers",
  EXTERNAL_PAYMENTS: "dashboard.redesign.expenseExternal",
  INVESTMENTS: "dashboard.redesign.expenseDev",
};

type Card = {
  type: ExpenseCategoryKey;
  total: number;
  changePct: number | null;
  sparkline: number[];
};

export function ExpenseCategoryCards({ cards }: { cards: Card[] }) {
  const { t } = useI18n();

  return (
    <section className="col-span-1 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm lg:col-span-2">
      <h2 className="font-arabic-brand mb-3 text-base font-bold text-slate-800">
        {t("dashboard.redesign.expensesByType")}
      </h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {cards.map((card) => {
          const style = STYLES[card.type];
          const Icon = style.icon;
          const path = smoothLinePath(card.sparkline, 80, 28, 2);
          const pct = card.changePct;
          const trendUp = pct != null && pct >= 0;

          return (
            <div
              key={card.type}
              className={`group flex flex-col rounded-2xl border border-slate-200/70 bg-gradient-to-br ${style.gradient} p-3 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-full ${style.ring}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-xs font-bold text-slate-600">{t(LABEL_KEYS[card.type])}</p>
              <p className="mt-1 text-lg font-black text-slate-900">
                <CountUp value={card.total} currency />
              </p>
              <p className={`mt-0.5 text-xs font-bold ${trendUp ? "text-rose-600" : "text-emerald-600"}`}>
                {pct == null
                  ? t("dashboard.trendNoChange")
                  : `${pct > 0 ? "+" : ""}${pct}%`}
              </p>
              <svg viewBox="0 0 80 28" className="mt-2 h-7 w-full opacity-80" aria-hidden>
                <path d={path} fill="none" stroke={style.line} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="sr-only">{formatShekel(card.total)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
