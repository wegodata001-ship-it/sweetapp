"use client";

import { useMemo, useState } from "react";

type LedgerType = "supplier" | "customer" | "employee";

const ledgers: Record<LedgerType, { name: string; balance: string; lastAction: string }[]> = {
  supplier: [
    { name: "ספק אפייה מרכזי", balance: "₪12,450-", lastAction: "חשבונית רכש 2381" },
    { name: "ספק אריזות מהירות", balance: "₪3,120-", lastAction: "הזמנת רכש 551" },
  ],
  customer: [
    { name: "לקוח מוסדי דרום", balance: "₪8,900+", lastAction: "חשבונית 9921" },
    { name: "לקוח אירועים גן", balance: "₪4,300+", lastAction: "קבלה 3014" },
  ],
  employee: [
    { name: "עובד ייצור א", balance: "₪1,250-", lastAction: "מקדמה חודשית" },
    { name: "עובד שילוח ב", balance: "₪0", lastAction: "התחשבנות נסיעות" },
  ],
};

const labels: Record<LedgerType, string> = {
  supplier: "ספק",
  customer: "לקוח",
  employee: "עובד",
};

export default function LedgersPage() {
  const [ledgerType, setLedgerType] = useState<LedgerType>("supplier");
  const rows = useMemo(() => ledgers[ledgerType], [ledgerType]);

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold tracking-[0.12em] text-cyan-700">כרטסות</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">כרטסת מאוחדת</h1>
        </div>
        <label className="text-sm font-semibold text-slate-700">
          סוג כרטסת
          <select
            value={ledgerType}
            onChange={(event) => setLedgerType(event.target.value as LedgerType)}
            className="mt-2 block min-w-44 rounded-xl border border-slate-300 bg-white px-3 py-2"
          >
            <option value="supplier">ספק</option>
            <option value="customer">לקוח</option>
            <option value="employee">עובד</option>
          </select>
        </label>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">שם</th>
              <th className="px-4 py-3 font-bold text-slate-600">סוג</th>
              <th className="px-4 py-3 font-bold text-slate-600">יתרה</th>
              <th className="px-4 py-3 font-bold text-slate-600">פעולה אחרונה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-slate-600">{labels[ledgerType]}</td>
                <td className="px-4 py-3 font-bold text-slate-900">{row.balance}</td>
                <td className="px-4 py-3 text-slate-600">{row.lastAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
