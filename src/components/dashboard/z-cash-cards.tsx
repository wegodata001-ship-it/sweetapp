"use client";

import { Banknote, CreditCard, FileCheck, Receipt } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";

type ZCash = {
  totalToday: number;
  cash: number;
  card: number;
  checks: number;
};

const ITEMS = [
  { key: "total", field: "totalToday" as const, icon: Receipt, glow: "shadow-[0_0_24px_rgba(34,211,238,0.25)]", grad: "from-cyan-50 to-sky-100/70" },
  { key: "cash", field: "cash" as const, icon: Banknote, glow: "shadow-[0_0_20px_rgba(16,185,129,0.2)]", grad: "from-emerald-50 to-teal-100/60" },
  { key: "card", field: "card" as const, icon: CreditCard, glow: "shadow-[0_0_20px_rgba(99,102,241,0.2)]", grad: "from-indigo-50 to-violet-100/60" },
  { key: "checks", field: "checks" as const, icon: FileCheck, glow: "shadow-[0_0_20px_rgba(251,191,36,0.2)]", grad: "from-amber-50 to-yellow-100/50" },
] as const;

const LABEL_KEYS: Record<(typeof ITEMS)[number]["key"], string> = {
  total: "dashboard.redesign.zTotal",
  cash: "dashboard.redesign.zCash",
  card: "dashboard.redesign.zCard",
  checks: "dashboard.redesign.zChecks",
};

export function ZCashCards({ data }: { data: ZCash }) {
  const { t } = useI18n();

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900/[0.02] to-cyan-50/30 p-3 shadow-sm">
      <h2 className="font-arabic-brand mb-3 text-base font-bold text-slate-800">
        {t("dashboard.redesign.zSection")}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const value = data[item.field];
          return (
            <div
              key={item.key}
              className={`rounded-2xl border border-slate-200/60 bg-gradient-to-br ${item.grad} p-3 ${item.glow} transition hover:scale-[1.02]`}
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-cyan-800 shadow-inner">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <p className="text-[11px] font-bold text-slate-600">{t(LABEL_KEYS[item.key])}</p>
              <p className="mt-1 text-base font-black text-slate-900">
                <CountUp value={value} currency />
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
