"use client";

import { useI18n } from "@/components/i18n-provider";
import premium from "@/components/dashboard/dashboard-premium.module.css";
import { formatShekel } from "@/lib/format-shekel";
import type { SupplierPaymentsMetrics } from "@/lib/dashboard/financial-engine";

export function SupplierPaymentsChart({ data }: { data: SupplierPaymentsMetrics }) {
  const { t } = useI18n();
  const items = [
    { key: "paid", label: "dashboard.redesign.supplierPaid", count: data.paidCount, color: "bg-emerald-500" },
    { key: "open", label: "dashboard.redesign.supplierOpen", count: data.openCount, color: "bg-slate-400" },
    { key: "late", label: "dashboard.redesign.supplierLate", count: data.lateCount, color: "bg-rose-500" },
    { key: "pending", label: "dashboard.redesign.supplierPending", count: data.pendingCount, color: "bg-amber-400" },
  ];
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className={`${premium.glassCard} bg-gradient-to-br from-slate-50/90 to-white/95 p-3`}>
      <h2 className="text-[14px] font-black text-slate-900">{t("dashboard.redesign.chartSuppliers")}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-2 py-1.5">
          <p className="text-[10px] font-bold text-emerald-800">{t("dashboard.redesign.supplierPaidAmount")}</p>
          <p className="text-sm font-black text-emerald-900">{formatShekel(data.totalPaidAmount)}</p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-2 py-1.5">
          <p className="text-[10px] font-bold text-rose-800">{t("dashboard.redesign.supplierOpenDebt")}</p>
          <p className="text-sm font-black text-rose-900">{formatShekel(data.openDebtAmount)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.key}>
            <div className="mb-0.5 flex justify-between text-[11px] font-bold text-slate-600">
              <span>{t(item.label)}</span>
              <span>{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${item.color} transition-all duration-500`}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {data.topSuppliers.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <p className="text-[11px] font-black text-slate-700">{t("dashboard.redesign.topSuppliers")}</p>
          <ul className="mt-1 space-y-1">
            {data.topSuppliers.map((s, i) => (
              <li key={s.id} className="flex justify-between text-[11px] font-semibold text-slate-600">
                <span>
                  {i + 1}. {s.name}
                </span>
                <span className="tabular-nums text-slate-900">{formatShekel(s.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
