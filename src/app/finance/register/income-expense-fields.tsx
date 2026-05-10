"use client";

import { Calculator, Calendar, CreditCard, FileText, Plus, Receipt, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DOCUMENT_TYPE_OPTIONS,
  incomeExpenseGrandTotal,
  incomeExpenseNetTotal,
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
  "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-slate-900 shadow-sm outline-none transition focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

const labelClass = "block text-sm font-bold text-slate-700";

type Props = {
  heading: string;
  headingClass?: string;
  iconClass?: string;
  intro: string;
  value: IncomeExpensePayload;
  onChange: (next: IncomeExpensePayload) => void;
};

export function IncomeExpenseFields({
  heading,
  headingClass = "text-slate-950",
  iconClass = "text-cyan-600",
  intro,
  value,
  onChange,
}: Props) {
  const showEventFields = value.clientMode === "event";
  const [productSuggestions, setProductSuggestions] = useState<string[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<string[]>([]);

  const lineTotals = value.lines.map((row) => lineGrossTotal(row.quantity, row.price, row.vatMode));
  const netLineTotals = value.lines.map((row) => lineNetTotal(row.quantity, row.price, row.vatMode));
  const vatLineTotals = value.lines.map((row) => lineVatTotal(row.quantity, row.price, row.vatMode));
  const netTotal = incomeExpenseNetTotal(value);
  const vatTotal = incomeExpenseVatTotal(value);
  const grandTotal = incomeExpenseGrandTotal(value);

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

  const paidInput = paymentLinesTotal(value);
  const paidOverTotal = value.kind === "income" && paidInput > grandTotal + 1e-9 && grandTotal >= 0;
  const paidEffective = Math.min(Math.max(0, paidInput), grandTotal);
  const remainingShow = Math.max(0, grandTotal - paidEffective);

  return (
    <section className="app-panel p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Receipt className={`h-5 w-5 ${iconClass}`} aria-hidden />
        <h2 className={`text-xl font-black ${headingClass}`}>{heading}</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">{intro}</p>

      <div className="mt-6">
        <p className="text-sm font-black text-slate-800">סוג לקוח</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPatch({ clientMode: "general" })}
            className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
              value.clientMode === "general"
                ? "border-luxury-gold bg-luxury-gold text-luxury-charcoal shadow-md"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            לקוח כללי
          </button>
          <button
            type="button"
            onClick={() => setPatch({ clientMode: "event" })}
            className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
              value.clientMode === "event"
                ? "border-amber-700 bg-amber-700 text-white shadow-md"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            לקוח אירועים
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className={labelClass}>
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" aria-hidden />
            שם לקוח
          </span>
          <input
            type="text"
            value={value.counterpartyName}
            list="customer-suggestions"
            onChange={(e) => {
              setPatch({ counterpartyName: e.target.value });
              void fetchCustomerSuggestions(e.target.value);
            }}
            className={inputClass}
            placeholder="לדוגמה: קייטרינג גולן"
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
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 md:p-5">
          <p className="text-sm font-black text-amber-900">פרטי אירוע</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={labelClass}>
              סכום פיקדון
              <input
                type="number"
                min={0}
                step="0.01"
                value={value.depositAmount}
                onChange={(e) => setPatch({ depositAmount: e.target.value })}
                className={inputClass}
                placeholder="0"
              />
            </label>
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

      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-black text-slate-900">שורות פריטים</p>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-2 rounded-xl bg-luxury-gold px-4 py-2 text-sm font-bold text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover"
          >
            <Plus className="h-4 w-4" aria-hidden />
            הוספת שורה
          </button>
        </div>

        <datalist id="product-history-suggestions">
          {productSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-[980px] w-full divide-y divide-slate-200 text-right text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 font-bold text-slate-600">שם פריט</th>
                <th className="px-3 py-3 font-bold text-slate-600">כמות</th>
                <th className="px-3 py-3 font-bold text-slate-600">מחיר יחידה</th>
                <th className="px-3 py-3 font-bold text-slate-600">מע״מ</th>
                <th className="px-3 py-3 font-bold text-slate-600">לפני מע״מ</th>
                <th className="px-3 py-3 font-bold text-slate-600">מע״מ</th>
                <th className="px-3 py-3 font-bold text-slate-600">סה״כ שורה</th>
                <th className="w-14 px-3 py-3 font-bold text-slate-600" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {value.lines.map((row, index) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.itemName}
                      list="product-history-suggestions"
                      onChange={(e) => {
                        updateLine(row.id, { itemName: e.target.value });
                        void fetchSuggestions(e.target.value);
                      }}
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-right"
                      placeholder={`פריט ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={row.quantity}
                      onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateLine(row.id, { price: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2 py-2 text-right"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={row.vatMode}
                      onChange={(e) => updateLine(row.id, { vatMode: e.target.value as VatMode })}
                      className="w-full rounded-lg border border-slate-200 px-1 py-2 text-right text-xs font-semibold"
                    >
                      {(Object.keys(VAT_MODE_LABELS) as VatMode[]).map((k) => (
                        <option key={k} value={k}>
                          {VAT_MODE_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 font-bold text-slate-700">{formatShekel(netLineTotals[index] ?? 0)}</td>
                  <td className="px-3 py-3 font-bold text-slate-700">{formatShekel(vatLineTotals[index] ?? 0)}</td>
                  <td className="px-3 py-3 font-bold text-slate-900">{formatShekel(lineTotals[index] ?? 0)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(row.id)}
                      className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                      aria-label="מחיקת שורה"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/60 px-4 py-4">
          <span className="flex items-center gap-2 text-sm font-bold text-cyan-900">
            <Calculator className="h-5 w-5" aria-hidden />
            סיכום מסמך
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-slate-800">
            <span>
              לפני מע״מ: <span className="font-black text-slate-950">{formatShekel(netTotal)}</span>
            </span>
            <span>
              מע״מ: <span className="font-black text-slate-950">{formatShekel(vatTotal)}</span>
            </span>
            <span>
              סה״כ: <span className="text-2xl font-black text-slate-950">{formatShekel(grandTotal)}</span>
            </span>
          </div>
        </div>

        {value.kind === "income" && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 md:px-5 md:py-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
              <CreditCard className="h-4 w-4 text-slate-600" aria-hidden />
              <p className="text-sm font-black text-slate-900">פרטי תשלום</p>
              <button
                type="button"
                onClick={addPayment}
                className="me-auto rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                הוסף אמצעי תשלום
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {value.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]"
                >
                  <label className={labelClass}>
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
                    className="self-end rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                    aria-label="מחיקת תשלום"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {paidOverTotal && (
              <p className="mt-3 text-xs font-bold text-rose-700" role="alert">
                סכום התשלום לא יכול לעלות על סה״כ המסמך.
              </p>
            )}
            {!paidOverTotal && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold text-slate-800">
                <span>
                  שולם: <span className="font-black text-slate-950">{formatShekel(paidEffective)}</span>
                </span>
                <span className="text-slate-400">|</span>
                <span>
                  נותר: <span className="font-black text-slate-950">{formatShekel(remainingShow)}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
