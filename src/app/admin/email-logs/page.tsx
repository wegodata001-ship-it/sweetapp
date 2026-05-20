"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";

type EmailLogRow = {
  id: string;
  recipient: string;
  recipientName: string | null;
  subject: string;
  type: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
};

export default function AdminEmailLogsPage() {
  const [rows, setRows] = useState<EmailLogRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      if (type !== "all") params.set("type", type);
      const res = await fetch(`/api/admin/email-logs?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; data?: EmailLogRow[] };
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
  }, [q, status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend(id: string) {
    const res = await fetch(`/api/admin/email-logs/${id}/resend`, {
      method: "POST",
      credentials: "same-origin",
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      alert(j.error ?? "שליחה מחדש נכשלה");
      return;
    }
    void load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-8" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-violet-800">
            <Mail className="h-4 w-4" aria-hidden />
            יומן מיילים
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Email Logs — Resend</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          רענון
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="חיפוש נמען / נושא…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">כל הסטטוסים</option>
          <option value="sent">נשלח</option>
          <option value="failed">נכשל</option>
          <option value="pending">ממתין</option>
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">כל הסוגים</option>
          <option value="TASK_ASSIGNED">TASK_ASSIGNED</option>
          <option value="TASK_COMPLETED">TASK_COMPLETED</option>
          <option value="SHIFT_LATE">SHIFT_LATE</option>
          <option value="CHECK_DEPOSIT">CHECK_DEPOSIT</option>
          <option value="FUTURE_ORDER">FUTURE_ORDER</option>
          <option value="NEW_UPDATE">NEW_UPDATE</option>
        </select>
      </div>

      {loading ? <p className="text-sm text-slate-500">טוען…</p> : null}
      {error ? <p className="text-sm font-bold text-red-600">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-start text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">זמן</th>
              <th className="px-3 py-2">נמען</th>
              <th className="px-3 py-2">נושא</th>
              <th className="px-3 py-2">סוג</th>
              <th className="px-3 py-2">סטטוס</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {new Date(r.createdAt).toLocaleString("he-IL")}
                </td>
                <td className="px-3 py-2">
                  <span className="font-semibold">{r.recipientName ?? r.recipient}</span>
                  <span className="block text-[10px] text-slate-400">{r.recipient}</span>
                </td>
                <td className="max-w-[220px] truncate px-3 py-2" title={r.subject}>
                  {r.subject}
                </td>
                <td className="px-3 py-2 font-mono">{r.type}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.status === "sent"
                        ? "text-emerald-700"
                        : r.status === "failed"
                          ? "text-red-600"
                          : "text-amber-600"
                    }
                  >
                    {r.status}
                  </span>
                  {r.error ? (
                    <span className="mt-0.5 block max-w-[160px] truncate text-[10px] text-red-500" title={r.error}>
                      {r.error}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void resend(r.id)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold hover:bg-slate-50"
                  >
                    שלח שוב
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">אין רשומות</p>
        ) : null}
      </div>
    </div>
  );
}
