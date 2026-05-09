"use client";

import { ExternalLink, FileStack, PencilLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deleteFinanceDocument, fetchFinanceDocuments, updateFinanceDocument } from "@/lib/finance/db";
import type { FinanceDocumentRow } from "@/lib/finance/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function FinanceArchivePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<FinanceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchFinanceDocuments();
    setRows(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const toggleSent = async (id: string, sent: boolean) => {
    if (id.startsWith("demo-arch")) {
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, sent_to_cpa: !sent } : row)));
      return;
    }
    const res = await updateFinanceDocument(id, { sent_to_cpa: !sent });
    if (res.ok) await refresh();
  };

  const deleteRow = async (id: string) => {
    if (id.startsWith("demo-arch")) {
      setRows((prev) => prev.filter((row) => row.id !== id));
      return;
    }
    const res = await deleteFinanceDocument(id);
    if (res.ok) await refresh();
  };

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
        <FileStack className="h-4 w-4" aria-hidden />
        ארכיון מסמכים
      </p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">ניהול מסמכים היסטוריים</h1>
      <p className="mt-2 text-sm text-slate-600">
        כל מסמך שפורסם נשמר כרשומה במערכת (כולל פירוט שדות הטופס). עריכה מלאה מתבצעת במסך רישום כספי.
        {!supabase && " במצב דמו ללא Supabase מוצגות רק רשומות לדוגמה."}
      </p>

      {loading && <p className="mt-6 text-sm font-semibold text-slate-500">טוען…</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[920px] w-full divide-y divide-slate-200 text-right text-sm">
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
                <td className="px-4 py-3 align-top">
                  <span className="font-semibold text-slate-900">{row.title}</span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="text-slate-700">{row.category}</span>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className="text-slate-700">{row.doc_date ?? "—"}</span>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/finance/register?edit=${encodeURIComponent(row.id)}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                    >
                      <PencilLine className="h-3.5 w-3.5" aria-hidden />
                      עריכה מלאה
                      <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void deleteRow(row.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      מחיקה
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100">
                    <input
                      type="checkbox"
                      checked={row.sent_to_cpa}
                      onChange={() => void toggleSent(row.id, row.sent_to_cpa)}
                      className="h-4 w-4 accent-slate-900"
                    />
                    הועבר לרואה חשבון
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && (
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">אין מסמכים ברשימה.</p>
      )}
    </div>
  );
}
