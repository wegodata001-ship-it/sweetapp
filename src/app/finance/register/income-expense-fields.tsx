"use client";

import { Calculator, Calendar, CreditCard, FileText, Package, Plus, Receipt, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DOCUMENT_TYPE_OPTIONS,
  DEPOSIT_TYPE_LABELS,
  DEPOSIT_TYPE_OPTIONS,
  incomeExpenseDepositAmount,
  incomeExpenseGrandTotal,
  incomeExpenseTotalToPay,
  incomeExpenseVatTotal,
  lineGrossTotal,
  lineNetTotal,
  lineVatTotal,
  newPaymentId,
  paymentLinesTotal,
  PAYMENT_METHOD_LABELS,
  PAYMENT_INSTRUMENT_OPTIONS,
  VAT_MODE_LABELS,
  type IncomeExpensePayload,
  type PaymentLinePayload,
  type VatMode,
} from "@/lib/finance/document-payload";
import { formatShekel } from "@/lib/format-shekel";

const inputClass =
  "mt-1 block h-11 min-h-[44px] w-full rounded-[16px] border border-slate-300 bg-white px-3 text-right text-sm text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

const labelClass = "block text-[13px] font-bold text-slate-700";

/** שם פריט בטבלה — מעט נמוך יותר מברירת המחדל */
const lineItemNameClass =
  "h-11 min-h-[44px] w-full rounded-[16px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineQtyClass =
  "h-11 min-h-[44px] w-[90px] rounded-[16px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineMoneyClass =
  "h-11 min-h-[44px] w-full min-w-[5rem] rounded-[16px] border border-slate-200 px-2 text-right text-sm outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

const lineSelectClass =
  "h-11 min-h-[44px] w-full rounded-[16px] border border-slate-200 px-1 text-right text-[13px] font-semibold outline-none focus:border-luxury-gold";

type Props = {
  heading: string;
  headingClass?: string;
  iconClass?: string;
  intro: string;
  value: IncomeExpensePayload;
  onChange: (next: IncomeExpensePayload) => void;
  disabled?: boolean;
  counterpartyInputId?: string;
};

export function IncomeExpenseFields({
  heading,
  headingClass = "text-slate-950",
  iconClass = "text-cyan-600",
  intro,
  value,
  onChange,
  disabled = false,
  counterpartyInputId,
}: Props) {
  const showEventFields = value.clientMode === "event";
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);
  const isExpense = value.kind === "expense";

  const lineTotals = value.lines.map((row) => lineGrossTotal(row.quantity, row.price, row.vatMode));
  const netLineTotals = value.lines.map((row) => lineNetTotal(row.quantity, row.price, row.vatMode));
  const vatLineTotals = value.lines.map((row) => lineVatTotal(row.quantity, row.price, row.vatMode));
  const vatTotal = incomeExpenseVatTotal(value);
  const grandTotal = incomeExpenseGrandTotal(value);
  const depositAmount = incomeExpenseDepositAmount(value);
  const totalToPay = incomeExpenseTotalToPay(value);
  const showDepositBox = !isExpense && (value.clientMode === "event" || value.includeDeposit);

  const setPatch = (patch: Partial<IncomeExpensePayload>) => onChange({ ...value, ...patch });

  const addLine = () => {
    onChange({
      ...value,
      lines: [
        ...value.lines,
        {
          id: `line-${Math.random().toString(36).slice(2, 10)}`,
          itemName: "",
          quantity: "1",
          price: "",
          vatMode: "includes_vat" as VatMode,
        },
      ],
    });
  };

  const removeLine = (id: string) => {
    if (value.lines.length <= 1) return;
    onChange({ ...value, lines: value.lines.filter((row) => row.id !== id) });
  };

  const updateLine = (id: string, patch: Partial<(typeof value.lines)[number]>) => {
    onChange({
      ...value,
      lines: value.lines.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const updatePayment = (id: string, patch: Partial<PaymentLinePayload>) => {
    onChange({
      ...value,
      payments: value.payments.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const addPayment = () => {
    onChange({
      ...value,
      payments: [
        ...value.payments,
        {
          id: newPaymentId(),
          instrument: PAYMENT_INSTRUMENT_OPTIONS[0],
          amount: "",
          notes: "",
        },
      ],
    });
  };

  const removePayment = (id: string) => {
    if (value.payments.length <= 1) return;
    onChange({ ...value, payments: value.payments.filter((row) => row.id !== id) });
  };

  const fetchSuggestions = async (query: string) => {
    const q = query.trim();
    if (q.length < 1) {
      setProductSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/product-history?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: string[] };
      setProductSuggestions(j.ok ? j.data ?? [] : []);
    } catch {
      setProductSuggestions([]);
    }
  };

  const fetchCustomerSuggestions = async (query: string) => {
    const q = query.trim();
    if (q.length < 1) {
      setCustomerSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`, {
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; data?: { name: string }[] };
      setCustomerSuggestions(j.ok ? (j.data ?? []).map((row) => row.name) : []);
    } catch {
      setCustomerSuggestions([]);
    }
  };

  useEffect(() => {
    if (value.payments.length > 0) return;
    onChange({
      ...value,
      payments: [
        {
          id: newPaymentId(),
          instrument: PAYMENT_INSTRUMENT_OPTIONS[0],
          amount: "",
          notes: "",
        },
      ],
    });
  }, [onChange, value]);

  const paymentTone = isExpense
    ? {
        border: "border-rose-200",
        bg: "bg-rose-50/75",
        icon: "text-rose-700",
        title: "text-rose-950",
        chip: "bg-rose-100 text-rose-900",
      }
    : {
        border: "border-emerald-200",
        bg: "bg-emerald-50/75",
        icon: "text-emerald-700",
        title: "text-emerald-950",
        chip: "bg-emerald-100 text-emerald-900",
      };
  const paidInput = paymentLinesTotal(value);
  const paymentOverpaid = paidInput > totalToPay + 1e-6 && totalToPay >= 0;
  const remainingShow = Math.max(0, totalToPay - paidInput);

  return (
    <section className="app-panel mb-[14px] p-[18px]">
      <fieldset disabled={disabled} className={disabled ? "pointer-events-none opacity-60" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <Receipt className={`h-4 w-4 ${iconClass}`} aria-hidden />
        <h2 className={`text-[22px] font-extrabold ${headingClass}`}>{heading}</h2>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-slate-600 opacity-70">{intro}</p>

      <div className="mt-3">
        <p className="text-[13px] font-black text-slate-800">סוג לקוח</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPatch({ clientMode: "general" })}
            className={`h-11 rounded-[16px] border px-[18px] text-[15px] font-bold transition ${
              value.clientMode === "general"
                ? "border-luxury-gold bg-luxury-gold text-luxury-charcoal shadow-sm"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            לקוח כללי
          </button>
          <button
            type="button"
            onClick={() => setPatch({ clientMode: "event" })}
            className={`h-11 rounded-[16px] border px-[18px] text-[15px] font-bold transition ${
              value.clientMode === "event"
                ? "border-amber-700 bg-amber-700 text-white shadow-sm"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            לקוח אירועים
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className={labelClass}>
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" aria-hidden />
            {isExpense ? "ספק / גורם" : "שם לקוח"}
          </span>
          <input
            id={counterpartyInputId}
            type="text"
            value={value.counterpartyName}
            list="customer-suggestions"
            onChange={(e) => {
              setPatch({ counterpartyName: e.target.value });
              void fetchCustomerSuggestions(e.target.value);
            }}
            className={inputClass}
            placeholder={isExpense ? "לדוגמה: ספק חומרי גלם" : "לדוגמה: קייטרינג גולן"}
          />
          <datalist id="customer-suggestions">
            {customerSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
            תאריך
          </span>
          <input type="date" value={value.docDate} onChange={(e) => setPatch({ docDate: e.target.value })} className={inputClass} />
        </label>
        <label className={`md:col-span-2 ${labelClass}`}>
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" aria-hidden />
            סוג מסמך
          </span>
          <select
            value={value.documentType || DOCUMENT_TYPE_OPTIONS[0]}
            onChange={(e) => setPatch({ documentType: e.target.value })}
            className={inputClass}
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showEventFields && (
        <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50/80 p-[18px]">
          <p className="text-[13px] font-black text-amber-900">פרטי אירוע</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className={labelClass}>
              כמות מגשים / כלים
              <input
                type="number"
                min={0}
                value={value.trayQty}
                onChange={(e) => setPatch({ trayQty: e.target.value })}
                className={inputClass}
                placeholder="0"
              />
            </label>
            <label className={labelClass}>
              תאריך החזרה
              <input type="date" value={value.returnDate} onChange={(e) => setPatch({ returnDate: e.target.value })} className={inputClass} />
            </label>
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-black text-slate-900">שורות פריטים</p>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-9 items-center gap-1.5 rounded-[16px] bg-luxury-gold px-3 py-1.5 text-[13px] font-bold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            הוספת שורה
          </button>
        </div>

        <datalist id="product-history-suggestions">
          {productSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="mt-3 overflow-x-auto rounded-[18px] border border-slate-200">
          <table className="min-w-[980px] w-full divide-y divide-slate-200 text-right text-[13px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-[10px] font-bold text-slate-600">שם פריט</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">כמות</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">מחיר יחידה</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">מע״מ</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">לפני מע״מ</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">מע״מ</th>
                <th className="px-2 py-[10px] font-bold text-slate-600">סה״כ שורה</th>
                <th className="w-12 px-2 py-[10px] font-bold text-slate-600" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {value.lines.map((row, index) => (
                <tr key={row.id} className="h-[68px]">
                  <td className="px-2 py-[10px] align-middle">
                    <input
                      type="text"
                      value={row.itemName}
                      list="product-history-suggestions"
                      onChange={(e) => {
                        updateLine(row.id, { itemName: e.target.value });
                        void fetchSuggestions(e.target.value);
                      }}
                      className={lineItemNameClass}
                      placeholder={`פריט ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                      className={lineQtyClass}
                    />
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateLine(row.id, { price: e.target.value })}
                      className={lineMoneyClass}
                    />
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <select
                      value={row.vatMode}
                      onChange={(e) => updateLine(row.id, { vatMode: e.target.value as VatMode })}
                      className={lineSelectClass}
                    >
                      {(Object.keys(VAT_MODE_LABELS) as VatMode[]).map((k) => (
                        <option key={k} value={k}>
                          {VAT_MODE_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-[10px] align-middle text-[15px] font-bold text-slate-700 tabular-nums">
                    {formatShekel(netLineTotals[index] ?? 0)}
                  </td>
                  <td className="px-2 py-[10px] align-middle text-[15px] font-bold text-slate-700 tabular-nums">
                    {formatShekel(vatLineTotals[index] ?? 0)}
                  </td>
                  <td className="px-2 py-[10px] align-middle text-[15px] font-bold text-slate-900 tabular-nums">
                    {formatShekel(lineTotals[index] ?? 0)}
                  </td>
                  <td className="px-2 py-[10px] align-middle">
                    <button
                      type="button"
                      onClick={() => removeLine(row.id)}
                      className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      aria-label="מחיקת שורה"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex min-h-[70px] flex-wrap items-center justify-between gap-4 rounded-[18px] border border-cyan-200 bg-cyan-50/70 px-[18px] py-3">
          <span className="flex items-center gap-2 text-[13px] font-bold text-cyan-900">
            <Calculator className="h-4 w-4 shrink-0" aria-hidden />
            סיכום
          </span>
          <div className="flex flex-1 flex-wrap items-end justify-end gap-6 sm:gap-10">
            <div className="text-center sm:text-right">
              <p className="text-[13px] font-bold text-slate-600 opacity-70">סה״כ</p>
              <p className="text-[28px] font-black tabular-nums leading-none text-slate-950">{formatShekel(grandTotal)}</p>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-[13px] font-bold text-slate-600 opacity-70">מע״מ</p>
              <p className="text-[28px] font-black tabular-nums leading-none text-slate-950">{formatShekel(vatTotal)}</p>
            </div>
            <div className="text-center sm:text-right">
              <p className="text-[13px] font-bold text-slate-600 opacity-70">לתשלום</p>
              <p className="text-[28px] font-black tabular-nums leading-none text-cyan-900">{formatShekel(totalToPay)}</p>
            </div>
          </div>
        </div>

        {showDepositBox && (
          <details className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50/75 p-[18px] shadow-sm">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-[13px] font-black text-amber-950">
              <Package className="h-4 w-4 text-amber-700" aria-hidden />
              פיקדון
              {value.includeDeposit && depositAmount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-950">
                  {formatShekel(depositAmount)}
                </span>
              ) : null}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr_1fr]">
              <label className="flex h-11 min-h-[44px] items-center gap-2 rounded-[16px] border border-amber-200 bg-white px-3 text-[13px] font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={value.includeDeposit}
                  onChange={(e) =>
                    setPatch({
                      includeDeposit: e.target.checked,
                      depositAmount: e.target.checked ? value.depositAmount : "",
                      depositNote: e.target.checked ? value.depositNote : "",
                    })
                  }
                  className="h-4 w-4 accent-amber-700"
                />
                כולל פיקדון
              </label>
              <label className={labelClass}>
                סוג פיקדון
                <select
                  value={value.depositType || DEPOSIT_TYPE_OPTIONS[0]}
                  onChange={(e) => setPatch({ depositType: e.target.value })}
                  disabled={!value.includeDeposit}
                  className={inputClass}
                >
                  {DEPOSIT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {DEPOSIT_TYPE_LABELS[opt]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                סכום פיקדון
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={value.depositAmount}
                  onChange={(e) => setPatch({ depositAmount: e.target.value })}
                  disabled={!value.includeDeposit}
                  className={inputClass}
                  placeholder="0"
                />
              </label>
              <label className={`md:col-span-3 ${labelClass}`}>
                הערת פיקדון
                <textarea
                  value={value.depositNote}
                  onChange={(e) => setPatch({ depositNote: e.target.value })}
                  disabled={!value.includeDeposit}
                  className="mt-1 block min-h-[52px] w-full resize-y rounded-[16px] border border-slate-300 bg-white px-3 py-2 text-right text-[15px] text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25 disabled:opacity-60"
                  placeholder="פיקדון עבור מגשי אירועים"
                />
              </label>
            </div>
          </details>
        )}

        {depositAmount > 0 ? (
          <p className="mt-3 rounded-[16px] border border-amber-100 bg-amber-50/90 px-3 py-2 text-[13px] font-semibold text-amber-950">
            פיקדון: <span className="font-black tabular-nums">{formatShekel(depositAmount)}</span>
          </p>
        ) : null}

        <div className={`mt-3 rounded-[18px] border ${paymentTone.border} ${paymentTone.bg} p-[18px]`}>
            <div className="flex h-[58px] flex-wrap items-center gap-2 border-b border-slate-200/80">
              <CreditCard className={`h-3.5 w-3.5 ${paymentTone.icon}`} aria-hidden />
              <p className={`text-[15px] font-black ${paymentTone.title}`}>פרטי תשלום</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${paymentTone.chip}`}>
                {isExpense ? "יציאה / חובה" : "כניסה / זכות"}
              </span>
              <button
                type="button"
                onClick={addPayment}
                className="me-auto inline-flex h-8 items-center rounded-[16px] bg-white px-2.5 py-1 text-[12px] font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                + אמצעי תשלום
              </button>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {value.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="grid min-h-[58px] items-center gap-x-2 gap-y-2 rounded-[16px] border border-slate-200 bg-white px-3 py-2 shadow-sm sm:grid-cols-[1fr_0.85fr_1.15fr_auto]"
                >
                  <label className={`${labelClass} mb-0`}>
                    אמצעי תשלום
                    <select
                      value={payment.instrument || PAYMENT_INSTRUMENT_OPTIONS[0]}
                      onChange={(e) => updatePayment(payment.id, { instrument: e.target.value })}
                      className={inputClass}
                    >
                      {PAYMENT_INSTRUMENT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {PAYMENT_METHOD_LABELS[opt]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    סכום
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={payment.amount}
                      onChange={(e) => updatePayment(payment.id, { amount: e.target.value })}
                      className={inputClass}
                      placeholder="0"
                    />
                  </label>
                  <label className={labelClass}>
                    הערות
                    <input
                      type="text"
                      value={payment.notes}
                      onChange={(e) => updatePayment(payment.id, { notes: e.target.value })}
                      className={inputClass}
                      placeholder="הערות תשלום"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removePayment(payment.id)}
                    className="self-center rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 sm:self-end"
                    aria-label="מחיקת תשלום"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {paymentOverpaid && (
              <p className="mt-2 text-[13px] font-bold text-rose-700" role="alert">
                סכום אמצעי התשלום לא יכול לעלות על סה״כ המסמך.
              </p>
            )}
            <div className="mt-4 grid gap-2 rounded-[14px] border border-slate-200 bg-white/90 px-3 py-2.5 text-[13px] font-bold sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">סה״כ מסמך</p>
                <p className="text-[18px] font-black tabular-nums text-slate-950">{formatShekel(totalToPay)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-emerald-700">שולם</p>
                <p className="text-[18px] font-black tabular-nums text-emerald-800">{formatShekel(paidInput)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-amber-800">יתרה פתוחה</p>
                <p
                  className={`text-[18px] font-black tabular-nums ${
                    remainingShow > 1e-6 ? "text-amber-900" : "text-slate-400"
                  }`}
                >
                  {formatShekel(remainingShow)}
                </p>
              </div>
            </div>
        </div>
      </div>
      </fieldset>
    </section>
  );
}
