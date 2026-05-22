"use client";

import { Gem, Heart, FileBadge } from "lucide-react";
import { CountUp } from "@/components/count-up";
import { useI18n } from "@/components/i18n-provider";

type WeddingData = { weddings: number; orders: number; documented: number };

export function WeddingOrderCards({ data }: { data: WeddingData }) {
  const { t } = useI18n();
  const cards = [
    { key: "weddings", value: data.weddings, icon: Heart, grad: "from-pink-50 to-rose-100/70", ring: "text-rose-600 bg-rose-500/15" },
    { key: "orders", value: data.orders, icon: Gem, grad: "from-violet-50 to-purple-100/60", ring: "text-violet-700 bg-violet-500/15" },
    { key: "documented", value: data.documented, icon: FileBadge, grad: "from-amber-50 to-yellow-100/60", ring: "text-amber-800 bg-amber-500/20" },
  ] as const;

  const labels: Record<(typeof cards)[number]["key"], string> = {
    weddings: "dashboard.redesign.weddings",
    orders: "dashboard.redesign.orders",
    documented: "dashboard.redesign.documented",
  };

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-pink-50/40 via-white to-amber-50/30 p-3 shadow-sm">
      <h2 className="font-arabic-brand mb-3 text-base font-bold text-slate-800">
        {t("dashboard.redesign.weddingSection")}
      </h2>
      <div className="flex flex-col gap-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              className={`flex items-center gap-3 rounded-2xl border border-white/80 bg-gradient-to-l ${c.grad} p-3 shadow-sm transition hover:shadow-md`}
            >
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${c.ring}`}>
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600">{t(labels[c.key])}</p>
                <p className="text-xl font-black text-slate-900">
                  <CountUp value={c.value} />
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
