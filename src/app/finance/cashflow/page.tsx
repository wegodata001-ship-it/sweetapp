"use client";

import { ArrowDownLeft, ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import { useMemo } from "react";
import { formatShekel } from "@/lib/format-shekel";
import { withCashRunningBalances } from "@/lib/running-calcs";

type CashRow = {
  date: string;
  description: string;
  inflow: number;
  outflow: number;
};

const OPENING_BALANCE = 42180.9;

const ROWS: CashRow[] = [
  {
    date: "2026-05-09",
    description: "פתיחת קופת מזומן בוקר + הפקדה אתמול",
    inflow: 5200,
    outflow: 0,
  },
  {
    date: "2026-05-09",
    description: "משלוח לקוח מוסדי — חשבונית מס 9044",
    inflow: 8760,
    outflow: 0,
  },
  {
    date: "2026-05-09",
    description: "דוח Z קופה — סיכום יום קודם (מזומן + אשראי)",
    inflow: 13240,
    outflow: 0,
  },
  {
    date: "2026-05-09",
    description: "תשלום ספק חלב וחמאה — העברה בנקאית",
    inflow: 0,
    outflow: 6890,
  },
  {
    date: "2026-05-09",
    description: "שירות שילוח דחופים — כרטיס אשראי עסקי",
    inflow: 0,
    outflow: 1240,
  },
  {
    date: "2026-05-09",
    description: "קיזוז פיקדון מגשים — החזר ללקוח אירוע",
    inflow: 0,
    outflow: 900,
  },
  {
    date: "2026-05-09",
    description: "קבלת תשלום זיכוי מספק אריזות",
    inflow: 630,
    outflow: 0,
  },
];

export default function CashflowPage() {
  const computed = useMemo(() => withCashRunningBalances(ROWS, OPENING_BALANCE), []);

  const closingBalance = computed.length ? computed[computed.length - 1].running : OPENING_BALANCE;

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
        <Wallet className="h-4 w-4" aria-hidden />
        תזרים מזומנים
      </p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">מעקב תנועות מזומן בפועל</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        תרחישי דמו ריאליסטיים: קופה, לקוחות, ספקים ושילוח. העמודה האחרונה מציגה יתרה רצה מחושבת מהיתרה
        הראשונית.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">יתרת פתיחה</p>
          <p className="mt-2 text-xl font-black text-slate-950">{formatShekel(OPENING_BALANCE)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <ArrowDownLeft className="h-4 w-4" aria-hidden />
            סה״כ נכנס בתקופה
          </p>
          <p className="mt-2 text-xl font-black text-emerald-900">
            {formatShekel(computed.reduce((s, r) => s + r.inflow, 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <ArrowUpRight className="h-4 w-4" aria-hidden />
            סה״כ יוצא בתקופה
          </p>
          <p className="mt-2 text-xl font-black text-rose-900">
            {formatShekel(computed.reduce((s, r) => s + r.outflow, 0))}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm font-bold text-cyan-900">
        <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
        יתרת סגירה לאחר כל השורות:{" "}
        <span className="font-black text-slate-950">{formatShekel(closingBalance)}</span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[880px] w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">תאריך</th>
              <th className="px-4 py-3 font-bold text-slate-600">תיאור פעולה</th>
              <th className="px-4 py-3 font-bold text-emerald-700">כניסה</th>
              <th className="px-4 py-3 font-bold text-rose-700">יציאה</th>
              <th className="px-4 py-3 font-bold text-slate-900">יתרה רצה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {computed.map((row, idx) => (
              <tr key={`${row.description}-${idx}`}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.date}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.description}</td>
                <td className="px-4 py-3 font-bold text-emerald-700">
                  {row.inflow ? formatShekel(row.inflow) : "—"}
                </td>
                <td className="px-4 py-3 font-bold text-rose-700">
                  {row.outflow ? formatShekel(row.outflow) : "—"}
                </td>
                <td className="px-4 py-3 font-black text-slate-950">{formatShekel(row.running)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
