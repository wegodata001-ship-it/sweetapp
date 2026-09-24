"use client";

import { useEffect, useState } from "react";
import { formatShekel } from "@/lib/format-shekel";

type Row = {
  id: string;
  date: string;
  partyName: string;
  documentNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  supplierId: string | null;
};

type Supplier = { id: string; name: string };

export default function UnlinkedSuppliersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [name, setName] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/finance/unlinked-supplier-documents", { credentials: "same-origin" });
    const body = (await res.json()) as { ok?: boolean; data?: Row[]; suppliers?: Supplier[]; error?: string };
    if (!body.ok) {
      setError(body.error || "שגיאה");
      return;
    }
    setRows(body.data ?? []);
    setSuppliers(body.suppliers ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function link(documentId: string, supplierId?: string, newSupplierName?: string) {
    setError("");
    const res = await fetch("/api/finance/unlinked-supplier-documents", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, supplierId, newSupplierName }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (!body.ok) {
      setError(body.error || "שגיאה");
      return;
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-6xl p-4 text-slate-950" dir="rtl">
      <h1 className="text-2xl font-black">מסמכי ספק ללא שיוך</h1>
      <p className="mt-1 text-sm text-slate-600">שיוך ידני בלבד. אין תיקון אוטומטי לפי שם.</p>
      {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-2 text-start">תאריך</th>
              <th className="px-2 py-2 text-start">שם במסמך</th>
              <th className="px-2 py-2 text-start">מספר מסמך</th>
              <th className="px-2 py-2 text-start">סה״כ</th>
              <th className="px-2 py-2 text-start">שולם</th>
              <th className="px-2 py-2 text-start">יתרה</th>
              <th className="px-2 py-2 text-start">ספק מקושר</th>
              <th className="px-2 py-2 text-start">פעולה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-2 py-2">{row.date}</td>
                <td className="px-2 py-2">{row.partyName}</td>
                <td className="px-2 py-2">{row.documentNumber}</td>
                <td className="px-2 py-2">{formatShekel(row.totalAmount)}</td>
                <td className="px-2 py-2">{formatShekel(row.paidAmount)}</td>
                <td className="px-2 py-2 font-bold">{formatShekel(row.remainingAmount)}</td>
                <td className="px-2 py-2">{row.supplierId ? "מקושר" : "—"}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-col gap-1">
                    <select className="rounded border px-1 py-1" value={pick[row.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [row.id]: e.target.value }))}>
                      <option value="">בחר ספק</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button type="button" className="text-start font-bold" disabled={!pick[row.id]} onClick={() => void link(row.id, pick[row.id])}>שייך</button>
                    <input className="rounded border px-1 py-1" placeholder="ספק חדש" value={name[row.id] ?? row.partyName} onChange={(e) => setName((n) => ({ ...n, [row.id]: e.target.value }))} />
                    <button type="button" className="text-start font-bold" onClick={() => void link(row.id, undefined, name[row.id] ?? row.partyName)}>צור ספק חדש</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
