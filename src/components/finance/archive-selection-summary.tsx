"use client";

import { useI18n } from "@/components/i18n-provider";
import {
  formatArchiveSelectionAmount,
  type ArchiveSelectionTotals,
} from "@/lib/finance/archive-selection-totals";

type Props = {
  totals: ArchiveSelectionTotals;
  variant?: "bar" | "modal" | "compact";
};

export function ArchiveSelectionSummary({ totals, variant = "bar" }: Props) {
  const { t } = useI18n();

  if (totals.count === 0) return null;

  const countLabel =
    totals.count === 1
      ? t("archive.selectedOne")
      : t("archive.selectedMany", { count: totals.count });

  const isBar = variant === "bar";
  const isModal = variant === "modal";

  return (
    <div
      className={
        isBar
          ? "space-y-1"
          : isModal
            ? "space-y-2 rounded-xl bg-slate-50 px-3 py-2.5"
            : "space-y-0.5 text-sm"
      }
    >
      <p
        className={
          isBar
            ? "text-sm font-black text-luxury-navy-rich"
            : "text-sm font-bold text-slate-800"
        }
      >
        {countLabel}
      </p>

      {totals.mixed ? (
        <div
          className={
            isBar
              ? "space-y-0.5 text-sm font-bold text-slate-800"
              : "space-y-1 text-sm font-semibold text-slate-700"
          }
        >
          <p>
            {t("archive.selectionIncomeTotal")}:{" "}
            <span className="tabular-nums text-emerald-800">
              {formatArchiveSelectionAmount(totals.income)}
            </span>
          </p>
          <p>
            {t("archive.selectionExpenseTotal")}:{" "}
            <span className="tabular-nums text-rose-800">
              {formatArchiveSelectionAmount(totals.expense)}
            </span>
          </p>
          <p>
            {t("archive.selectionNet")}:{" "}
            <span className="tabular-nums font-black text-luxury-navy-rich">
              {formatArchiveSelectionAmount(totals.net)}
            </span>
          </p>
        </div>
      ) : (
        <p
          className={
            isBar
              ? "text-base font-black tabular-nums text-luxury-navy-rich"
              : "text-sm font-bold tabular-nums text-slate-900"
          }
        >
          {isModal ? t("archive.selectionDocumentsTotal") : t("archive.selectionTotal")}:{" "}
          {formatArchiveSelectionAmount(totals.total)}
        </p>
      )}
    </div>
  );
}
