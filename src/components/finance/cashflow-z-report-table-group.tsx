"use client";

import { ChevronDown, Receipt } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { CashflowMenuAction } from "@/components/finance/cashflow-row-actions-menu";
import { CashflowRowActionsMenu } from "@/components/finance/cashflow-row-actions-menu";
import { useI18n } from "@/components/i18n-provider";
import type { ZReportCashflowSummary } from "@/lib/finance/cashflow-z-report";
import type { CashFlowRow } from "@/lib/finance/types";
import { formatShekel } from "@/lib/format-shekel";

const summaryRowClass =
  "cursor-pointer border-b-2 border-slate-200/90 bg-slate-50/95 transition hover:bg-slate-100/80";

function paymentStatusLabel(status: string, t: (k: string) => string): string {
  const k = status.trim().toLowerCase();
  if (k === "paid") return t("statuses.payment.paid");
  if (k === "partial") return t("statuses.payment.partial");
  if (k === "unpaid") return t("statuses.payment.unpaid");
  return status || "—";
}

export type ZReportTableGroupProps = {
  summary: ZReportCashflowSummary;
  expanded: boolean;
  onToggle: () => void;
  detailLines: CashFlowRow[] | null;
  detailTime: string | null;
  detailStatus: string | null;
  detailCashier: string | null;
  loadingDetail: boolean;
  pdfBusy?: boolean;
  onMenuAction: (action: CashflowMenuAction) => void;
  renderDesktopRow: (row: CashFlowRow, nested: boolean) => ReactNode;
  renderMobileRow: (row: CashFlowRow, nested: boolean) => ReactNode;
};

/** שורת סיכום + שורות פירוט (lazy) בתוך טבלת יומן התזרים */
export function CashflowZReportTableGroupDesktop({
  summary,
  expanded,
  onToggle,
  detailLines,
  detailTime,
  detailStatus,
  detailCashier,
  loadingDetail,
  pdfBusy,
  onMenuAction,
  renderDesktopRow,
}: ZReportTableGroupProps) {
  const { t, bcp47 } = useI18n();
  const zLabel = summary.zNumber
    ? t("cashflow.zReport.summaryTitle", { number: summary.zNumber })
    : summary.title;
  const dateFormatted = summary.entryDate
    ? new Date(`${summary.entryDate}T12:00:00`).toLocaleDateString(
        bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL",
        { day: "2-digit", month: "2-digit", year: "numeric" },
      )
    : "—";
  const statusText = detailStatus ? paymentStatusLabel(detailStatus, t) : "—";
  const timeText = detailTime ?? "—";
  const methodsText =
    summary.paymentMethodLabels.length > 0 ? summary.paymentMethodLabels.join(" · ") : "—";

  return (
    <Fragment key={`z-desktop-${summary.zReportId}`}>
      <tr className={summaryRowClass} onClick={onToggle} aria-expanded={expanded}>
        <td className="align-middle py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-label={expanded ? t("cashflow.zReport.hideDetails") : t("cashflow.zReport.showDetails")}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <div className="min-w-0 text-end">
              <p className="text-[13px] font-bold text-slate-800">{dateFormatted}</p>
              <p className="text-[11px] font-medium text-slate-500">{timeText}</p>
            </div>
          </div>
        </td>
        <td className="align-middle py-3">
          <span className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-0.5 text-[11px] font-bold text-cyan-900 ring-1 ring-cyan-100">
            <Receipt className="h-3 w-3" aria-hidden />
            {t("cashflow.subtypeZ")}
          </span>
        </td>
        <td className="align-middle py-3">
          <p className="text-[14px] font-black text-slate-950">{zLabel}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            {t("cashflow.zReport.movementCount", { count: summary.lineCount })}
          </p>
        </td>
        <td className="align-middle py-3">
          <p className="text-[12px] font-semibold text-slate-700">{methodsText}</p>
          {detailCashier ? (
            <p className="mt-0.5 text-[11px] text-slate-500">
              {t("cashflow.zReport.sectionEmployee")}: {detailCashier}
            </p>
          ) : null}
          <p className="mt-0.5 text-[11px] font-bold text-slate-600">{statusText}</p>
        </td>
        <td className="align-middle py-3 text-end tabular-nums">
          <span className="text-[15px] font-black text-emerald-800">
            {formatShekel(summary.totalInflow)}
          </span>
        </td>
        <td className="align-middle py-3 text-end tabular-nums">
          <span className="text-[13px] font-semibold text-slate-400">
            {summary.totalOutflow > 0 ? formatShekel(summary.totalOutflow) : "—"}
          </span>
        </td>
        <td className="align-middle py-3" onClick={(e) => e.stopPropagation()}>
          <CashflowRowActionsMenu
            variant="zReport"
            onAction={onMenuAction}
            pdfBusy={pdfBusy}
            canView
            canAddPayment={false}
            canGenerateDocument={false}
          />
        </td>
      </tr>
      {expanded && loadingDetail ? (
        <tr className="bg-slate-50/50">
          <td colSpan={7} className="px-4 py-4 text-center text-sm font-semibold text-slate-500">
            {t("cashflow.zReport.loadingDetails")}
          </td>
        </tr>
      ) : null}
      {expanded && !loadingDetail && detailLines
        ? detailLines.map((line) => renderDesktopRow(line, true))
        : null}
    </Fragment>
  );
}

export function CashflowZReportTableGroupMobile({
  summary,
  expanded,
  onToggle,
  detailLines,
  detailTime,
  detailStatus,
  loadingDetail,
  pdfBusy,
  onMenuAction,
  renderMobileRow,
}: ZReportTableGroupProps) {
  const { t, bcp47 } = useI18n();
  const zLabel = summary.zNumber
    ? t("cashflow.zReport.summaryTitle", { number: summary.zNumber })
    : summary.title;
  const dateFormatted = summary.entryDate
    ? new Date(`${summary.entryDate}T12:00:00`).toLocaleDateString(
        bcp47 === "ar" ? "ar-IL" : bcp47 === "en" ? "en-GB" : "he-IL",
        { day: "2-digit", month: "2-digit", year: "numeric" },
      )
    : "—";
  const statusText = detailStatus ? paymentStatusLabel(detailStatus, t) : null;

  return (
    <div key={`z-mobile-${summary.zReportId}`} className="space-y-0">
      <article
        className="rounded-xl border-2 border-slate-200 bg-slate-50/95 p-3 shadow-sm"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <div className="min-w-0 flex-1 text-end" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-slate-950">{zLabel}</p>
            <p className="mt-1 text-[12px] font-semibold text-slate-600">
              {dateFormatted}
              {detailTime ? ` · ${detailTime}` : ""}
            </p>
            <p className="mt-1 text-xl font-black text-emerald-800">{formatShekel(summary.totalInflow)}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              {t("cashflow.zReport.movementCount", { count: summary.lineCount })}
              {statusText ? ` · ${statusText}` : ""}
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <CashflowRowActionsMenu
              variant="zReport"
              onAction={onMenuAction}
              pdfBusy={pdfBusy}
              canView
              canAddPayment={false}
              canGenerateDocument={false}
            />
          </div>
        </div>
      </article>
      {expanded && loadingDetail ? (
        <p className="py-3 text-center text-sm font-semibold text-slate-500">
          {t("cashflow.zReport.loadingDetails")}
        </p>
      ) : null}
      {expanded && !loadingDetail && detailLines ? (
        <div className="ms-3 space-y-2 border-s-2 border-slate-200/80 ps-2 pt-2">
          {detailLines.map((line) => renderMobileRow(line, true))}
        </div>
      ) : null}
    </div>
  );
}
