"use client";

import { useCallback, useEffect, useState } from "react";

type DebugRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: string;
  recipientUserId: string;
  recipientName: string | null;
  recipientRole: string;
  subjectUserId: string | null;
  roleTarget: string;
  isRead: boolean;
  actionUrl: string | null;
  createdAt: string;
};

export default function NotificationsDebugPage() {
  const [rows, setRows] = useState<DebugRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/debug/notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; data?: DebugRow[] };
      if (!res.ok || !j.ok) {
        setError(j.error ?? "טעינה נכשלה");
        setRows([]);
        return;
      }
      setRows(j.data ?? []);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">Notifications QA (זמני)</h1>
          <p className="mt-1 text-sm text-slate-600">80 התראות אחרונות — DB → API → debug</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          רענון
        </button>
      </header>

      {loading ? <p className="text-sm text-slate-500">טוען…</p> : null}
      {error ? <p className="text-sm font-bold text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-start text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2">זמן</th>
              <th className="px-2 py-2">סוג</th>
              <th className="px-2 py-2">נמען</th>
              <th className="px-2 py-2">תפקיד</th>
              <th className="px-2 py-2">כותרת</th>
              <th className="px-2 py-2">נקרא</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                  {new Date(r.createdAt).toLocaleString("he-IL")}
                </td>
                <td className="px-2 py-2 font-mono">{r.type}</td>
                <td className="px-2 py-2">
                  {r.recipientName ?? r.recipientUserId}
                  <span className="block text-[10px] text-slate-400">{r.recipientUserId}</span>
                </td>
                <td className="px-2 py-2">{r.roleTarget}</td>
                <td className="max-w-[240px] truncate px-2 py-2" title={r.message}>
                  {r.title}
                </td>
                <td className="px-2 py-2">{r.isRead ? "✓" : "●"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
