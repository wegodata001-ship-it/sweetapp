"use client";

import { AlertTriangle, Layers, TrendingUp, Warehouse, type LucideIcon } from "lucide-react";

export type WarehouseKpi = {
  key: string;
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
};

export function WarehouseKpiCards({ items }: { items: WarehouseKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className="group relative overflow-hidden rounded-[20px] border border-[#e7ecf5] bg-white/80 p-4 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(108,76,255,0.1)]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div
              className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-40 blur-2xl transition group-hover:opacity-60"
              style={{ background: item.accent }}
            />
            <div className="relative flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold text-slate-600">{item.label}</p>
                <p
                  className="mt-2 text-3xl font-black tabular-nums tracking-tight text-slate-900"
                  style={{ color: undefined }}
                >
                  {item.value}
                </p>
              </div>
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm transition duration-200 group-hover:scale-105"
                style={{ background: item.iconBg, color: item.accent }}
              >
                <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
