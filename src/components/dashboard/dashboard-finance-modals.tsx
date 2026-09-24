"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { formatShekel } from "@/lib/format-shekel";

export { FinancialSummaryModal } from "@/components/dashboard/financial-summary-modal";

type DebtRow = {
  id: string;
  name: string;
  phone: string | null;
  charges: number;
  payments: number;
  debt: number;
};

export function CustomerDebtModal({
  open,
  totalDebt,
  count,
  onClose,
}: {
  open: boolean;
  totalDebt: number;
  count: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<DebtRow[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/ledger/v2/overview?side=DEBT&sort=debt&pageSize=100", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; rows?: DebtRow[] }) => {
        if (body.ok && body.rows) setRows(body.rows.filter((row) => row.debt > 0));
      })
      .catch(() => setRows([]));
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim();
    const list = q
      ? rows.filter((row) => row.name.includes(q) || (row.phone ?? "").includes(q))
      : rows;
    return [...list].sort((a, b) => b.debt - a.debt);
  }, [rows, query]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" role="dialog">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-4 text-slate-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">{t("dashboard.redesign.customerDebt")}</h2>
            <p className="mt-1 text-sm font-semibold">{formatShekel(totalDebt)}</p>
            <p className="text-xs text-slate-500">{t("dashboard.redesign.customersInDebt", { count })}</p>
          </div>
          <button type="button" className="font-bold" onClick={onClose}>ֳ—</button>
        </div>
        <input
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("dashboard.redesign.customerDebt")}
        />
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-start text-slate-500">
              <th>{t("register.fields.customer")}</th>
              <th>{t("dashboard.redesign.debtPhone")}</th>
              <th>{t("dashboard.redesign.debtCharges")}</th>
              <th>{t("dashboard.redesign.debtPayments")}</th>
              <th>{t("dashboard.redesign.customerDebt")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td>{row.name}</td>
                <td>{row.phone || "ג€”"}</td>
                <td>{formatShekel(row.charges)}</td>
                <td>{formatShekel(row.payments)}</td>
                <td className="font-black">{formatShekel(row.debt)}</td>
                <td>
                  <button
                    type="button"
                    className="font-bold text-slate-900"
                    onClick={() => router.push(`/finance/ledger-v2?customer=${encodeURIComponent(row.id)}`)}
                  >
                    {t("register.manualReceipt.view")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
