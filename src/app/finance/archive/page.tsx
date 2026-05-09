"use client";

import { BadgeCheck, FileStack, PencilLine, Trash2 } from "lucide-react";
import { useState } from "react";

type ArchiveRow = {
  id: number;
  doc: string;
  type: string;
  date: string;
  sentToCpa: boolean;
};

const initialRows: ArchiveRow[] = [
  { id: 1, doc: "חשבונית מס 9044", type: "הכנסה", date: "2026-05-09", sentToCpa: true },
  { id: 2, doc: "קבלה 3017", type: "הכנסה", date: "2026-05-08", sentToCpa: false },
  { id: 3, doc: "חשבונית ספק 4412", type: "הוצאה", date: "2026-05-07", sentToCpa: false },
  { id: 4, doc: "דוח Z מספר 982", type: "קופה", date: "2026-05-06", sentToCpa: true },
  { id: 5, doc: "הזמנת אירוע עם פיקדון — 118", type: "אירוע", date: "2026-05-05", sentToCpa: false },
];

export default function FinanceArchivePage() {
  const [rows, setRows] = useState(initialRows);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ doc: "", type: "", date: "" });

  const toggleSent = (id: number) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, sentToCpa: !row.sentToCpa } : row)),
    );
  };

  const deleteRow = (id: number) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const startEdit = (row: ArchiveRow) => {
    setEditingId(row.id);
    setDraft({ doc: row.doc, type: row.type, date: row.date });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({ doc: "", type: "", date: "" });
  };

  const saveEdit = () => {
    if (!editingId) return;
    setRows((prev) =>
      prev.map((row) =>
        row.id === editingId ? { ...row, doc: draft.doc.trim(), type: draft.type.trim(), date: draft.date } : row,
      ),
    );
    cancelEdit();
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-right text-sm font-semibold text-slate-900";

  return (
    <div className="mx-auto max-w-7xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
      <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
        <FileStack className="h-4 w-4" aria-hidden />
        ארכיון מסמכים
      </p>
      <h1 className="mt-3 text-3xl font-black text-slate-950">ניהול מסמכים היסטוריים</h1>
      <p className="mt-2 text-sm text-slate-600">
        עריכה, מחיקה וסימון העברה לרואה חשבון — כל הפעולות פעילות על נתוני דמו מקומיים.
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-[960px] w-full divide-y divide-slate-200 text-right text-sm">
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
            {rows.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id}>
                  <td className="px-4 py-3 align-top">
                    {isEditing ? (
                      <input className={inputClass} value={draft.doc} onChange={(e) => setDraft((d) => ({ ...d, doc: e.target.value }))} />
                    ) : (
                      <span className="font-semibold text-slate-900">{row.doc}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {isEditing ? (
                      <input className={inputClass} value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))} />
                    ) : (
                      <span className="text-slate-700">{row.type}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {isEditing ? (
                      <input type="date" className={inputClass} value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
                    ) : (
                      <span className="text-slate-700">{row.date}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                          >
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                            שמירה
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                          >
                            ביטול
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                        >
                          <PencilLine className="h-3.5 w-3.5" aria-hidden />
                          עריכה
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
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
                        checked={row.sentToCpa}
                        onChange={() => toggleSent(row.id)}
                        className="h-4 w-4 accent-slate-900"
                      />
                      הועבר לרואה חשבון
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">אין מסמכים ברשימה.</p>
      )}
    </div>
  );
}
