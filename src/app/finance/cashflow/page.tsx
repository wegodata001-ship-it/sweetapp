"use client";

import { ArrowDownLeft, ArrowUpRight, CirclePlus, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCashFlowEntries,
  fetchCashOpeningBalance,
  insertDirectCashFlow,
  updateCashFlowEntry,
} from "@/lib/finance/db";
import type { CashFlowRow } from "@/lib/finance/types";
import { formatShekel, parseNum } from "@/lib/format-shekel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { withCashRunningBalances } from "@/lib/running-calcs";

export default function CashflowPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [opening, setOpening] = useState(42180.9);
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [directOpen, setDirectOpen] = useState(false);
  const [directDate, setDirectDate] = useState("");
  const [directDesc, setDirectDesc] = useState("");
  const [directAmount, setDirectAmount] = useState("");
  const [directSide, setDirectSide] = useState<"debit" | "credit">("credit");
  const [savingDirect, setSavingDirect] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [op, list] = await Promise.all([fetchCashOpeningBalance(), fetchCashFlowEntries()]);
      setOpening(op);
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll();
    });
  }, [loadAll]);

  const computed = useMemo(() => withCashRunningBalances(rows, opening), [rows, opening]);

  const closingBalance = computed.length ? computed[computed.length - 1].running : opening;

  const totalIn = useMemo(() => computed.reduce((s, r) => s + r.inflow, 0), [computed]);
  const totalOut = useMemo(() => computed.reduce((s, r) => s + r.outflow, 0), [computed]);

  const persistCell = async (
    row: CashFlowRow,
    patch: Partial<Pick<CashFlowRow, "entry_date" | "inflow" | "outflow">>,
  ) => {
    if (!supabase || row.id.startsWith("demo-")) {
      setNotice("עריכה נשמרת במסד נתונים בלבד — הגדר NEXT_PUBLIC_SUPABASE_URL והמפתח לשימוש מלא.");
      return;
    }
    const res = await updateCashFlowEntry(row.id, patch);
    if (!res.ok) {
      setNotice(res.error ?? "שגיאת שמירה");
      return;
    }
    setNotice(null);
    await loadAll();
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setNotice("רישום ישיר דורש חיבור ל-Supabase.");
      return;
    }
    const amt = Math.abs(parseNum(directAmount));
    if (!directDate || amt <= 0) {
      setNotice("נא למלא תאריך וסכום חיובי.");
      return;
    }
    setSavingDirect(true);
    const res = await insertDirectCashFlow({
      entry_date: directDate,
      description: directDesc,
      side: directSide,
      amount: amt,
    });
    setSavingDirect(false);
    if (!res.ok) {
      setNotice(res.error ?? "שגיאה");
      return;
    }
    setNotice(null);
    setDirectOpen(false);
    setDirectDesc("");
    setDirectAmount("");
    await loadAll();
  };

  const inputClass =
    "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

  return (
    <div className="mx-auto max-w-7xl app-panel p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
            <Wallet className="h-4 w-4" aria-hidden />
            תזרים מזומנים
          </p>
          <h1 className="mt-3 text-3xl font-black text-slate-950">מעקב תנועות מזומן בפועל</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            עריכת תאריך וסכומים נשמרת בטבלת <code className="rounded bg-slate-100 px-1">cash_flow_entries</code>. ניתן לרשום תנועה ישירה (חובה/זכות) מהירה.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            setDirectDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
            setDirectOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover"
        >
          <CirclePlus className="h-5 w-5" aria-hidden />
          רישום ישירות
        </button>
      </div>

      {notice && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">
          {notice}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-500">יתרת פתיחה</p>
          <p className="mt-2 text-xl font-black text-slate-950">{formatShekel(opening)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <ArrowDownLeft className="h-4 w-4" aria-hidden />
            סה״כ נכנס בתקופה
          </p>
          <p className="mt-2 text-xl font-black text-emerald-900">{formatShekel(totalIn)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <ArrowUpRight className="h-4 w-4" aria-hidden />
            סה״כ יוצא בתקופה
          </p>
          <p className="mt-2 text-xl font-black text-rose-900">{formatShekel(totalOut)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3 text-sm font-bold text-cyan-900">
        <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
        יתרת סגירה לאחר כל השורות:{" "}
        <span className="font-black text-slate-950">{formatShekel(closingBalance)}</span>
        {!supabase && <span className="mr-2 text-amber-800">(דמו מקומי)</span>}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[960px] w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">תאריך</th>
              <th className="px-4 py-3 font-bold text-slate-600">תיאור פעולה</th>
              <th className="px-4 py-3 font-bold text-emerald-700">כניסה (זכות)</th>
              <th className="px-4 py-3 font-bold text-rose-700">יציאה (חובה)</th>
              <th className="px-4 py-3 font-bold text-slate-900">יתרה רצה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center font-semibold text-slate-500">
                  טוען…
                </td>
              </tr>
            )}
            {!loading &&
              computed.map((row, idx) => (
                <tr key={`${row.id}-${row.entry_date}-${row.inflow}-${row.outflow}-${idx}`}>
                  <td className="whitespace-nowrap px-4 py-2 align-middle">
                    <input
                      type="date"
                      className={inputClass}
                      defaultValue={row.entry_date}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v && v !== row.entry_date) void persistCell(row, { entry_date: v });
                      }}
                      disabled={!supabase || row.id.startsWith("demo-")}
                    />
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.description}</td>
                  <td className="px-4 py-2 align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      defaultValue={row.inflow || ""}
                      placeholder="0"
                      onBlur={(e) => {
                        const v = parseNum(e.target.value);
                        if (v !== row.inflow) void persistCell(row, { inflow: v, outflow: v > 0 ? 0 : row.outflow });
                      }}
                      disabled={!supabase || row.id.startsWith("demo-")}
                    />
                  </td>
                  <td className="px-4 py-2 align-middle">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      defaultValue={row.outflow || ""}
                      placeholder="0"
                      onBlur={(e) => {
                        const v = parseNum(e.target.value);
                        if (v !== row.outflow) void persistCell(row, { outflow: v, inflow: v > 0 ? 0 : row.inflow });
                      }}
                      disabled={!supabase || row.id.startsWith("demo-")}
                    />
                  </td>
                  <td className="px-4 py-3 font-black text-slate-950">{formatShekel(row.running)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {directOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md app-panel p-6 shadow-xl">
            <h2 className="text-lg font-black text-slate-950">רישום ישירות</h2>
            <p className="mt-1 text-sm text-slate-600">זכות = כניסה לקופה, חובה = יציאה מהקופה.</p>
            <form className="mt-4 space-y-4" onSubmit={handleDirectSubmit}>
              <label className="block text-sm font-bold text-slate-800">
                תאריך
                <input
                  type="date"
                  required
                  value={directDate}
                  onChange={(e) => setDirectDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right"
                />
              </label>
              <label className="block text-sm font-bold text-slate-800">
                תיאור
                <input
                  type="text"
                  value={directDesc}
                  onChange={(e) => setDirectDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right"
                  placeholder="לדוגמה: תשלום שוטף"
                />
              </label>
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="radio"
                    name="side"
                    checked={directSide === "credit"}
                    onChange={() => setDirectSide("credit")}
                  />
                  זכות (כניסה)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input
                    type="radio"
                    name="side"
                    checked={directSide === "debit"}
                    onChange={() => setDirectSide("debit")}
                  />
                  חובה (יציאה)
                </label>
              </div>
              <label className="block text-sm font-bold text-slate-800">
                סכום
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={directAmount}
                  onChange={(e) => setDirectAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right"
                />
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingDirect}
                  className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
                >
                  {savingDirect ? "שומר…" : "שמירה"}
                </button>
                <button
                  type="button"
                  onClick={() => setDirectOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
