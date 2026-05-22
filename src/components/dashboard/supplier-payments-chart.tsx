"use client";

import { useI18n } from "@/components/i18n-provider";

type SupplierChart = { paid: number; open: number; late: number; pending: number };

const COLORS = {
  paid: "bg-emerald-500",
  open: "bg-slate-400",
  late: "bg-rose-500",
  pending: "bg-amber-400",
};

export function SupplierPaymentsChart({ data }: { data: SupplierChart }) {
  const { t } = useI18n();
  const items = [
    { key: "paid" as const, label: "dashboard.redesign.supplierPaid", value: data.paid },
    { key: "open" as const, label: "dashboard.redesign.supplierOpen", value: data.open },
    { key: "late" as const, label: "dashboard.redesign.supplierLate", value: data.late },
    { key: "pending" as const, label: "dashboard.redesign.supplierPending", value: data.pending },
  ];
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
      <h2 className="erp-section-title">{t("dashboard.redesign.chartSuppliers")}</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.key}>
            <div className="mb-1 flex justify-between text-xs font-bold text-slate-600">
              <span>{t(item.label)}</span>
              <span className="text-slate-900">{item.value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${COLORS[item.key]} transition-all duration-700`}
                style={{ width: `${(item.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
