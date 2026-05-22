"use client";

import { AlertTriangle, CheckCircle2, Clock, TrendingUp, type LucideIcon } from "lucide-react";

type Stat = {
  icon: LucideIcon;
  tone: "emerald" | "rose" | "amber" | "sky";
  label: string;
  value: string;
};

const toneMap = {
  emerald: "from-emerald-50 via-white to-emerald-50/30 border-emerald-100/90",
  rose: "from-rose-50 via-white to-rose-50/30 border-rose-100/90",
  amber: "from-amber-50 via-white to-amber-50/30 border-amber-100/90",
  sky: "from-sky-50 via-white to-sky-50/30 border-sky-100/90",
};

const iconTone = {
  emerald: "bg-emerald-100 text-emerald-700 shadow-emerald-100",
  rose: "bg-rose-100 text-rose-700 shadow-rose-100",
  amber: "bg-amber-100 text-amber-800 shadow-amber-100",
  sky: "bg-sky-100 text-sky-800 shadow-sky-100",
};

export function InventoryStatsCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ icon: Icon, tone, label, value }) => (
        <div
          key={label}
          className={`flex min-h-[112px] flex-col justify-between rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition hover:shadow-md ${toneMap[tone]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-bold leading-snug text-slate-700">{label}</p>
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full shadow-sm ${iconTone[tone]}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
