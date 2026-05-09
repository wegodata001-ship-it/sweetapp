"use client";

import { useState } from "react";

type ArchiveRow = {
  id: number;
  doc: string;
  type: string;
  date: string;
  sentToCpa: boolean;
};

const initialRows: ArchiveRow[] = [
  { id: 1, doc: "חשבונית 9921", type: "הכנסה", date: "08/05/2026", sentToCpa: true },
  { id: 2, doc: "קבלה 3014", type: "הכנסה", date: "08/05/2026", sentToCpa: false },
  { id: 3, doc: "חשבונית ספק 2381", type: "הוצאה", date: "09/05/2026", sentToCpa: false },
];

export default function FinanceArchivePage() {
  const [rows, setRows] = useState(initialRows);

  const toggleSent = (id: number) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, sentToCpa: !row.sentToCpa } : row)),
    );
  };

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-bold tracking-[0.12em] text-cyan-700">ארכיון מסמכים</p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">ניהול מסמכים היסטוריים</h1>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">מסמך</th>
              <th className="px-4 py-3 font-bold text-slate-600">סוג</th>
              <th className="px-4 py-3 font-bold text-slate-600">תאריך</th>
              <th className="px-4 py-3 font-bold text-slate-600">פעולות</th>
              <th className="px-4 py-3 font-bold text-slate-600">הועבר לרואה חשבון</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.doc}</td>
                <td className="px-4 py-3 text-slate-700">{row.type}</td>
                <td className="px-4 py-3 text-slate-700">{row.date}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-lg border border-indigo-300 px-3 py-1 text-xs font-bold text-indigo-700">
                      עריכה
                    </button>
                    <button className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-bold text-rose-700">
                      מחיקה
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={row.sentToCpa}
                      onChange={() => toggleSent(row.id)}
                      className="h-4 w-4"
                    />
                    כן
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
