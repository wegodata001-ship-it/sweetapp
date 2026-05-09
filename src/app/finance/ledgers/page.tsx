"use client";

import { BookMarked, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { formatShekel } from "@/lib/format-shekel";
import { withLedgerRunningBalances } from "@/lib/running-calcs";

type LedgerType = "supplier" | "customer" | "employee";

type LedgerMovement = {
  date: string;
  docType: string;
  description: string;
  debit: number;
  credit: number;
};

const openingBalances: Record<LedgerType, number> = {
  supplier: 18240.5,
  customer: 9650,
  employee: 3200,
};

const movements: Record<LedgerType, LedgerMovement[]> = {
  supplier: [
    { date: "2026-05-01", docType: "חשבונית רכש", description: "ספק קמח מרכזי — אספקה שבועית", debit: 4100, credit: 0 },
    { date: "2026-05-03", docType: "תשלום", description: "העברה בנקאית לספק", debit: 0, credit: 8200 },
    { date: "2026-05-05", docType: "חשבונית רכש", description: "חומרי אריזה חד פעמי", debit: 1290.75, credit: 0 },
    { date: "2026-05-07", docType: "זיכוי", description: "החזרת סחורה פגומה", debit: 0, credit: 410 },
    { date: "2026-05-09", docType: "חשבונית רכש", description: "שמנת וחמאה לייצור", debit: 2680, credit: 0 },
  ],
  customer: [
    { date: "2026-05-02", docType: "חשבונית מס", description: "משלוח קונדיטוריה — רשת דרום", debit: 0, credit: 5400 },
    { date: "2026-05-04", docType: "קבלה", description: "תשלום מזומן — חשבונית 9921", debit: 3200, credit: 0 },
    { date: "2026-05-06", docType: "חשבונית זיכוי", description: "ביטול פריטים באירוע", debit: 890, credit: 0 },
    { date: "2026-05-08", docType: "הזמנת אירוע", description: "פיקדון מגשים — גן אירועים שמשון", debit: 0, credit: 1800 },
    { date: "2026-05-09", docType: "קבלה", description: "סגירת יתרה — העברה בנקאית", debit: 4500, credit: 0 },
  ],
  employee: [
    { date: "2026-05-01", docType: "משכורת", description: "שכר בסיס — עובד ייצור א׳", debit: 6200, credit: 0 },
    { date: "2026-05-01", docType: "שווי הטבות", description: "ארוחות במפעל", debit: 420, credit: 0 },
    { date: "2026-05-05", docType: "מקדמה", description: "מקדמה על חשבון שכר", debit: 0, credit: 1500 },
    { date: "2026-05-09", docType: "נסיעות", description: "החזר נסיעות שבועי", debit: 380, credit: 0 },
  ],
};

const labels: Record<LedgerType, string> = {
  supplier: "ספק",
  customer: "לקוח",
  employee: "עובד",
};

export default function LedgersPage() {
  const [ledgerType, setLedgerType] = useState<LedgerType>("supplier");

  const rowsWithBalance = useMemo(
    () => withLedgerRunningBalances(movements[ledgerType], openingBalances[ledgerType]),
    [ledgerType],
  );

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
            <BookMarked className="h-4 w-4" aria-hidden />
            כרטסות
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">כרטסת מאוחדת</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            סינון לפי סוג ישות עם תנועות דמו ויתרה רצה מחושבת (יתרת פתיחה + חובה − זכות).
          </p>
        </div>
        <label className="text-sm font-bold text-slate-800">
          <span className="mb-2 flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden />
            סוג כרטסת
          </span>
          <select
            value={ledgerType}
            onChange={(event) => setLedgerType(event.target.value as LedgerType)}
            className="mt-1 block min-w-[12rem] rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-semibold text-slate-900 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
          >
            <option value="supplier">ספק</option>
            <option value="customer">לקוח</option>
            <option value="employee">עובד</option>
          </select>
        </label>
      </div>

      <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
        סוג נבחר:{" "}
        <span className="font-black text-slate-950">{labels[ledgerType]}</span>
        <span className="mx-2 text-slate-400">|</span>
        יתרת פתיחה:{" "}
        <span className="font-black text-slate-950">{formatShekel(openingBalances[ledgerType])}</span>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[920px] w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">תאריך</th>
              <th className="px-4 py-3 font-bold text-slate-600">סוג מסמך</th>
              <th className="px-4 py-3 font-bold text-slate-600">תיאור</th>
              <th className="px-4 py-3 font-bold text-rose-700">חובה</th>
              <th className="px-4 py-3 font-bold text-emerald-700">זכות</th>
              <th className="px-4 py-3 font-bold text-slate-900">יתרה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rowsWithBalance.map((row, idx) => (
              <tr key={`${row.date}-${row.description}-${idx}`}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.date}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.docType}</td>
                <td className="px-4 py-3 text-slate-600">{row.description}</td>
                <td className="px-4 py-3 font-bold text-slate-900">
                  {row.debit ? formatShekel(row.debit) : "—"}
                </td>
                <td className="px-4 py-3 font-bold text-slate-900">
                  {row.credit ? formatShekel(row.credit) : "—"}
                </td>
                <td className="px-4 py-3 font-black text-slate-950">{formatShekel(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
