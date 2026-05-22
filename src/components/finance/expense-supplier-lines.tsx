"use client";

import type { KeyboardEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ProductLinePicker } from "@/components/finance/product-line-picker";
import { useI18n } from "@/components/i18n-provider";
import type { ProductPickerRow } from "@/lib/finance/product-picker-catalog";
import {
  lineGrossTotal,
  newLineId,
  type FinanceLineItemPayload,
  type IncomeExpensePayload,
  type VatMode,
} from "@/lib/finance/document-payload";
import { formatShekel } from "@/lib/format-shekel";

const lineQtyClass =
  "h-9 w-[72px] rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineMoneyClass =
  "h-9 min-w-[5rem] w-full rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineNoteClass =
  "h-9 w-full min-w-[6rem] rounded-lg border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

type Props = {
  value: IncomeExpensePayload;
  onChange: (next: IncomeExpensePayload) => void;
  disabled?: boolean;
  supplierId: string | null;
  focusLineId: string | null;
  setFocusLineId: (id: string | null) => void;
  onApplyProductPick: (lineId: string, picked: ProductPickerRow) => void;
};

export function ExpenseSupplierLines({
  value,
  onChange,
  disabled,
  supplierId,
  focusLineId,
  setFocusLineId,
  onApplyProductPick,
}: Props) {
  const { t } = useI18n();

  const updateLine = (id: string, patch: Partial<FinanceLineItemPayload>) => {
    onChange({
      ...value,
      lines: value.lines.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const addLine = () => {
    const newId = newLineId();
    onChange({
      ...value,
      lines: [
        ...value.lines,
        {
          id: newId,
          itemName: "",
          quantity: "1",
          price: "",
          vatMode: "includes_vat" as VatMode,
          supplierProductId: null,
          lineNote: "",
        },
      ],
    });
    setFocusLineId(newId);
  };

  const removeLine = (id: string) => {
    if (value.lines.length <= 1) return;
    onChange({ ...value, lines: value.lines.filter((row) => row.id !== id) });
  };

  const handleTableKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    addLine();
  };

  return (
    <div className="mt-3" onKeyDown={handleTableKeyDown}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-black text-slate-900">{t("register.lines.title")}</p>
        <button
          type="button"
          onClick={addLine}
          disabled={disabled}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-luxury-gold px-3 text-[13px] font-bold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("register.lines.addLine")}
        </button>
      </div>

      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[720px] w-full divide-y divide-slate-100 text-right text-[13px]">
          <thead className="bg-slate-50/90">
            <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">{t("register.lines.itemName")}</th>
              <th className="w-[80px] px-2 py-2">{t("register.fields.quantity")}</th>
              <th className="w-[100px] px-2 py-2">{t("register.fields.unitPrice")}</th>
              <th className="w-[96px] px-2 py-2">{t("register.fields.lineTotal")}</th>
              <th className="min-w-[120px] px-2 py-2">{t("register.lines.lineNote")}</th>
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 bg-white">
            {value.lines.map((row, index) => {
              const lineTotal = lineGrossTotal(row.quantity, row.price, row.vatMode);
              return (
                <tr key={row.id} className="h-11 align-middle hover:bg-slate-50/80">
                  <td className="px-2 py-1">
                    <ProductLinePicker
                      value={row.itemName}
                      supplierId={supplierId}
                      disabled={disabled}
                      autoOpen={focusLineId === row.id}
                      onAutoOpenDone={() => setFocusLineId(null)}
                      placeholder={t("register.lines.itemPlaceholder", { n: index + 1 })}
                      onFocusLine={() => setFocusLineId(row.id)}
                      onChange={(name) => {
                        setFocusLineId(row.id);
                        updateLine(row.id, {
                          itemName: name,
                          ...(name.trim() ? {} : { supplierProductId: null, priceFlag: null }),
                        });
                      }}
                      onSelect={(picked) => onApplyProductPick(row.id, picked)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      disabled={disabled}
                      value={row.quantity}
                      onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                      className={lineQtyClass}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={disabled}
                      value={row.price}
                      onChange={(e) => updateLine(row.id, { price: e.target.value })}
                      className={lineMoneyClass}
                    />
                  </td>
                  <td className="px-2 py-1 text-[14px] font-black tabular-nums text-slate-900">
                    {formatShekel(lineTotal)}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      disabled={disabled}
                      value={row.lineNote ?? ""}
                      onChange={(e) => updateLine(row.id, { lineNote: e.target.value })}
                      className={lineNoteClass}
                      placeholder={t("register.lines.lineNotePlaceholder")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      disabled={disabled || value.lines.length <= 1}
                      onClick={() => removeLine(row.id)}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                      aria-label={t("register.lines.deleteLine")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-slate-500">{t("register.lines.enterAddsRow")}</p>
    </div>
  );
}
