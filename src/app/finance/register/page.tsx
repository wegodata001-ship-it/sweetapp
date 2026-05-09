"use client";

import {
  Calculator,
  Calendar,
  FileSpreadsheet,
  FileText,
  Plus,
  Receipt,
  Send,
  Trash2,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatShekel, parseNum } from "@/lib/format-shekel";

const DOCUMENT_TYPES = [
  "חשבונית מס קבלה",
  "חשבונית מס",
  "הצעת מחיר",
  "תעודת משלוח",
  "חשבונית זיכוי",
  "הזמנת אירוע עם פיקדון",
] as const;

const EVENT_DOC_TYPE = "הזמנת אירוע עם פיקדון";

type TabId = "income" | "zreport" | "expenses";

const tabs: { id: TabId; label: string }[] = [
  { id: "income", label: "מסמכי הכנסה ואירועים" },
  { id: "zreport", label: "דוח Z" },
  { id: "expenses", label: "רישום הוצאות" },
];

type LineRow = { id: string; itemName: string; quantity: string; price: string };

function newLineId(): string {
  return `line-${Math.random().toString(36).slice(2, 10)}`;
}

export default function FinanceRegisterPage() {
  const [activeTab, setActiveTab] = useState<TabId>("income");

  const [customerName, setCustomerName] = useState("");
  const [incomeDate, setIncomeDate] = useState("");
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0]);
  const [depositAmount, setDepositAmount] = useState("");
  const [trayQty, setTrayQty] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [lines, setLines] = useState<LineRow[]>([
    { id: newLineId(), itemName: "", quantity: "1", price: "" },
  ]);

  const lineTotals = useMemo(
    () =>
      lines.map((row) => {
        const q = parseNum(row.quantity);
        const p = parseNum(row.price);
        return q * p;
      }),
    [lines],
  );

  const grandTotalIncome = useMemo(() => lineTotals.reduce((a, b) => a + b, 0), [lineTotals]);

  const showEventFields = documentType === EVENT_DOC_TYPE;

  const addLine = () => {
    setLines((prev) => [...prev, { id: newLineId(), itemName: "", quantity: "1", price: "" }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const updateLine = (id: string, patch: Partial<Omit<LineRow, "id">>) => {
    setLines((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const [zDate, setZDate] = useState("");
  const [zNumber, setZNumber] = useState("");
  const [cashTaxable, setCashTaxable] = useState("");
  const [cashExempt, setCashExempt] = useState("");
  const [creditTaxable, setCreditTaxable] = useState("");
  const [creditExempt, setCreditExempt] = useState("");
  const [transfers, setTransfers] = useState("");

  const zGrandTotal = useMemo(() => {
    return (
      parseNum(cashTaxable) +
      parseNum(cashExempt) +
      parseNum(creditTaxable) +
      parseNum(creditExempt) +
      parseNum(transfers)
    );
  }, [cashTaxable, cashExempt, creditTaxable, creditExempt, transfers]);

  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [amountBeforeVat, setAmountBeforeVat] = useState("");
  const [vatAmount, setVatAmount] = useState("");

  const expenseTotal = useMemo(
    () => parseNum(amountBeforeVat) + parseNum(vatAmount),
    [amountBeforeVat, vatAmount],
  );

  const [orderSentNotice, setOrderSentNotice] = useState(false);

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-right text-slate-900 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200";

  const labelClass = "block text-sm font-bold text-slate-700";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
              רישום כספי
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">ניהול מסמכים ורישומים</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              טפסים חיים עם חישובי סיכומים, פירוט תשלומים בדוח Z והוצאות לפי מע״מ.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-md"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === "income" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Receipt className="h-5 w-5 text-cyan-600" aria-hidden />
            <h2 className="text-xl font-black text-slate-950">מסמכי הכנסה ואירועים</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            רישום חשבוניות ומסמכים מסחריים; בהזמנת אירוע יוצגו שדות פיקדון ומגשים.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              <span className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" aria-hidden />
                שם לקוח
              </span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className={inputClass}
                placeholder="לדוגמה: קייטרינג גולן"
              />
            </label>
            <label className={labelClass}>
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
                תאריך
              </span>
              <input type="date" value={incomeDate} onChange={(e) => setIncomeDate(e.target.value)} className={inputClass} />
            </label>
            <label className={`md:col-span-2 ${labelClass}`}>
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-500" aria-hidden />
                סוג מסמך
              </span>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className={inputClass}
              >
                {DOCUMENT_TYPES.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {showEventFields && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 md:p-5">
              <p className="text-sm font-black text-amber-900">פרטי אירוע עם פיקדון</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className={labelClass}>
                  סכום פיקדון
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </label>
                <label className={labelClass}>
                  כמות מגשים / כלים
                  <input
                    type="number"
                    min={0}
                    value={trayQty}
                    onChange={(e) => setTrayQty(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </label>
                <label className={labelClass}>
                  תאריך החזרה
                  <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputClass} />
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
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden />
                הוספת שורה
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[640px] w-full divide-y divide-slate-200 text-right text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 font-bold text-slate-600">שם פריט</th>
                    <th className="px-3 py-3 font-bold text-slate-600">כמות</th>
                    <th className="px-3 py-3 font-bold text-slate-600">מחיר יחידה</th>
                    <th className="px-3 py-3 font-bold text-slate-600">סה״כ שורה</th>
                    <th className="w-14 px-3 py-3 font-bold text-slate-600" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {lines.map((row, index) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.itemName}
                          onChange={(e) => updateLine(row.id, { itemName: e.target.value })}
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
                סה״כ כולל שורות
              </span>
              <span className="text-2xl font-black text-slate-950">{formatShekel(grandTotalIncome)}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="rounded-xl bg-cyan-600 px-5 py-3 font-bold text-white hover:bg-cyan-700">
              שמירת טיוטה
            </button>
            <button type="button" className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-800 hover:bg-slate-50">
              פרסום מסמך
            </button>
          </div>
        </section>
      )}

      {activeTab === "zreport" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Calculator className="h-5 w-5 text-cyan-600" aria-hidden />
            <h2 className="text-xl font-black text-slate-950">דוח Z קופה</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            פירוט סיכומי תשלום יומי; הסכום הכולל מחושב אוטומטית.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              תאריך
              <input type="date" value={zDate} onChange={(e) => setZDate(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              מספר דוח Z
              <input
                type="text"
                value={zNumber}
                onChange={(e) => setZNumber(e.target.value)}
                className={inputClass}
                placeholder="לדוגמה: Z‏-‏1042"
              />
            </label>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>
              מזומן חייב
              <input
                type="number"
                min={0}
                step="0.01"
                value={cashTaxable}
                onChange={(e) => setCashTaxable(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              מזומן פטור
              <input
                type="number"
                min={0}
                step="0.01"
                value={cashExempt}
                onChange={(e) => setCashExempt(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              אשראי חייב
              <input
                type="number"
                min={0}
                step="0.01"
                value={creditTaxable}
                onChange={(e) => setCreditTaxable(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              אשראי פטור
              <input
                type="number"
                min={0}
                step="0.01"
                value={creditExempt}
                onChange={(e) => setCreditExempt(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={`sm:col-span-2 lg:col-span-1 ${labelClass}`}>
              העברות בנק
              <input
                type="number"
                min={0}
                step="0.01"
                value={transfers}
                onChange={(e) => setTransfers(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-black text-emerald-900">סה״כ דוח Z</span>
              <span className="text-3xl font-black text-slate-950">{formatShekel(zGrandTotal)}</span>
            </div>
          </div>

          <button type="button" className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-800">
            שמירת דוח Z
          </button>
        </section>
      )}

      {activeTab === "expenses" && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Receipt className="h-5 w-5 text-rose-600" aria-hidden />
                <h2 className="text-xl font-black text-slate-950">רישום הוצאות</h2>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                תיעוד הוצאה כולל בסיס למע״מ וסכום כולל מחושב.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOrderSentNotice(true);
                window.setTimeout(() => setOrderSentNotice(false), 3500);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 py-4 text-base font-black text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700"
            >
              <Send className="h-5 w-5" aria-hidden />
              שליחת הזמנה לספק
            </button>
          </div>

          {orderSentNotice && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
              ההזמנה נשלחה לספק (דמו).
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              ספק
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className={inputClass}
                placeholder="שם הספק"
              />
            </label>
            <label className={labelClass}>
              קטגוריה
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                <option value="">בחר קטגוריה</option>
                <option value="חומרי גלם">חומרי גלם</option>
                <option value="אריזות">אריזות</option>
                <option value="שירותים">שירותים</option>
                <option value="שילוח">שילוח</option>
                <option value="אחר">אחר</option>
              </select>
            </label>
            <label className={labelClass}>
              תאריך
              <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              מספר מסמך
              <input
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className={inputClass}
                placeholder="חשבונית ספק / תעודה"
              />
            </label>
            <label className={labelClass}>
              סכום לפני מע״מ
              <input
                type="number"
                min={0}
                step="0.01"
                value={amountBeforeVat}
                onChange={(e) => setAmountBeforeVat(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              סכום מע״מ
              <input
                type="number"
                min={0}
                step="0.01"
                value={vatAmount}
                onChange={(e) => setVatAmount(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-700">סה״כ לתשלום (כולל מע״מ)</span>
              <span className="text-2xl font-black text-slate-950">{formatShekel(expenseTotal)}</span>
            </div>
          </div>

          <button type="button" className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white hover:bg-slate-800">
            שמירת הוצאה
          </button>
        </section>
      )}
    </div>
  );
}
