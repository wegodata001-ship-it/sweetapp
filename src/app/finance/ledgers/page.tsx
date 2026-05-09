"use client";

import { BookMarked, Filter } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEntitiesByType, fetchLedgerForFilters } from "@/lib/finance/db";
import type { EntityType, FinanceEntityRow, LedgerMovementView } from "@/lib/finance/types";
import { formatShekel } from "@/lib/format-shekel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { withLedgerRunningBalances } from "@/lib/running-calcs";

const labels: Record<EntityType, string> = {
  supplier: "ספק",
  customer: "לקוח",
  employee: "עובד",
};

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { dateFrom: iso(from), dateTo: iso(to) };
}

export default function LedgersPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [entityType, setEntityType] = useState<EntityType>("supplier");
  const [entities, setEntities] = useState<FinanceEntityRow[]>([]);
  const [entityId, setEntityId] = useState<string>("");
  const [{ dateFrom, dateTo }, setRange] = useState(defaultDateRange);
  const [movements, setMovements] = useState<LedgerMovementView[]>([]);
  const [opening, setOpening] = useState(0);
  const [entityLabel, setEntityLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchEntitiesByType(entityType);
        if (cancelled) return;
        setEntities(list);
        setEntityId((prev) => {
          if (prev && list.some((e) => e.id === prev)) return prev;
          return list[0]?.id ?? "";
        });
      } catch {
        if (!cancelled) setError("טעינת גופים נכשלה.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType]);

  const loadLedger = useCallback(async () => {
    if (!entityId) {
      setMovements([]);
      setOpening(0);
      setEntityLabel("");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLedgerForFilters({
        entityId,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      });
      setOpening(res.opening);
      setMovements(res.movements);
      setEntityLabel(res.entityName);
    } catch {
      setError("טעינת כרטסת נכשלה.");
    } finally {
      setLoading(false);
    }
  }, [entityId, dateFrom, dateTo]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLedger();
    });
  }, [loadLedger]);

  const rowsWithBalance = useMemo(
    () => withLedgerRunningBalances(movements, opening),
    [movements, opening],
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
            סינון לפי סוג ישות, שם ספציפי וטווח תאריכים. הנתונים נטענים ממסד הנתונים (Supabase) כאשר מוגדרות משתני סביבה.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-bold text-slate-800">
          <span className="mb-2 flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden />
            סוג ישות
          </span>
          <select
            value={entityType}
            onChange={(event) => setEntityType(event.target.value as EntityType)}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-semibold text-slate-900 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
          >
            <option value="supplier">ספק</option>
            <option value="customer">לקוח</option>
            <option value="employee">עובד</option>
          </select>
        </label>

        <label className="text-sm font-bold text-slate-800">
          שם / גורם
          <select
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            disabled={!entities.length}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-semibold text-slate-900 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:opacity-50"
          >
            {entities.length === 0 ? (
              <option value="">אין גופים בטווח</option>
            ) : (
              entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="text-sm font-bold text-slate-800">
          מתאריך
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setRange((r) => ({ ...r, dateFrom: e.target.value }))}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-semibold text-slate-900 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
          />
        </label>

        <label className="text-sm font-bold text-slate-800">
          עד תאריך
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setRange((r) => ({ ...r, dateTo: e.target.value }))}
            className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-semibold text-slate-900 shadow-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
          />
        </label>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
        סוג ישות: <span className="font-black text-slate-950">{labels[entityType]}</span>
        <span className="mx-2 text-slate-400">|</span>
        גורם: <span className="font-black text-slate-950">{entityLabel || "—"}</span>
        <span className="mx-2 text-slate-400">|</span>
        יתרת פתיחה: <span className="font-black text-slate-950">{formatShekel(opening)}</span>
        {!supabase && (
          <>
            <span className="mx-2 text-slate-400">|</span>
            <span className="text-amber-700">מצב דמו מקומי (ללא Supabase)</span>
          </>
        )}
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
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center font-semibold text-slate-500">
                  טוען…
                </td>
              </tr>
            )}
            {!loading &&
              rowsWithBalance.map((row, idx) => (
                <tr key={`${row.id}-${idx}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.entry_date}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.doc_type}</td>
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

      {!loading && rowsWithBalance.length === 0 && (
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">אין תנועות בטווח הנבחר.</p>
      )}
    </div>
  );
}
