"use client";

import { Check, Pencil, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  CashflowRowActionsMenu,
  type CashflowMenuAction,
} from "@/components/finance/cashflow-row-actions-menu";
import {
  CASHFLOW_KIND_BADGE,
  CASHFLOW_KIND_LABEL_KEY,
  formatCashflowDescriptionLines,
  getCashflowDisplayKind,
  getCashflowTypeSublabel,
  paymentMethodLabel,
} from "@/lib/finance/cashflow-display";
import type { CashFlowRow } from "@/lib/finance/types";

const chipClass =
  "inline-flex max-w-full items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight ring-1 ring-inset";

const editActionBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40";

type TypeCellProps = {
  row: CashFlowRow;
  editable?: boolean;
  menuOpen?: boolean;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  onToggleMenu?: () => void;
  onPickIncome?: () => void;
  onPickExpense?: () => void;
};

export function CashflowTypeCell({
  row,
  editable,
  menuOpen,
  menuRef,
  onToggleMenu,
  onPickIncome,
  onPickExpense,
}: TypeCellProps) {
  const { t } = useI18n();
  const kind = getCashflowDisplayKind(row);
  const sub = getCashflowTypeSublabel(row, t);

  return (
    <div className={`flex min-w-0 flex-col items-end gap-0.5 ${editable ? "relative" : ""}`}>
      <div className="flex items-center gap-1">
        <span className={`${chipClass} ${CASHFLOW_KIND_BADGE[kind]}`}>
          {t(CASHFLOW_KIND_LABEL_KEY[kind])}
        </span>
        {editable ? (
          <button
            type="button"
            title={t("cashflow.changeType")}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onToggleMenu}
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        ) : null}
      </div>
      {sub ? <span className="max-w-full truncate text-[11px] font-normal text-slate-500">{sub}</span> : null}
      {editable && menuOpen ? (
        <div
          ref={menuRef}
          className="absolute start-0 top-full z-40 mt-1 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-right text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={onPickIncome}
          >
            {t("cashflow.typeIncome")}
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-right text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={onPickExpense}
          >
            {t("cashflow.typeExpense")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CashflowDescriptionCell({ description }: { description: string | null | undefined }) {
  const { primary, secondary } = formatCashflowDescriptionLines(description);
  return (
    <div className="min-w-0 text-right">
      <p className="truncate text-[13px] font-semibold leading-snug text-slate-900">{primary}</p>
      {secondary ? (
        <p className="mt-0.5 truncate text-[12px] font-normal leading-snug text-slate-500">{secondary}</p>
      ) : null}
    </div>
  );
}

export function CashflowMethodCustomerCell({ row }: { row: CashFlowRow }) {
  const method = paymentMethodLabel(row.payment_method);
  const cust = row.customer_name?.trim();
  if (!method && !cust) {
    return <span className="text-[12px] text-slate-400">—</span>;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
      {method ? (
        <span className={`${chipClass} bg-slate-50 text-slate-600 ring-slate-200`}>{method}</span>
      ) : null}
      {cust ? (
        <span className={`${chipClass} max-w-[140px] truncate bg-slate-50 text-slate-600 ring-slate-200`}>
          {cust}
        </span>
      ) : null}
    </div>
  );
}

type ActionsProps = {
  row: CashFlowRow;
  editing?: boolean;
  onSave?: () => void;
  onCancel?: () => void;
  onMenuAction?: (action: CashflowMenuAction) => void;
  pdfBusy?: boolean;
  busy?: boolean;
};

export function CashflowRowActions({
  row,
  editing,
  onSave,
  onCancel,
  onMenuAction,
  pdfBusy,
  busy,
}: ActionsProps) {
  const { t } = useI18n();

  if (editing) {
    return (
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
        <button type="button" title={t("cashflow.actionSave")} className={editActionBtn} onClick={onSave}>
          <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden />
        </button>
        <button type="button" title={t("common.cancel")} className={editActionBtn} onClick={onCancel}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <CashflowRowActionsMenu
      busy={busy}
      pdfBusy={pdfBusy}
      canView={Boolean(row.document_id)}
      onAction={(action) => onMenuAction?.(action)}
    />
  );
}

export type { CashflowMenuAction };
