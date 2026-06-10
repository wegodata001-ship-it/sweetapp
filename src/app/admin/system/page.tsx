"use client";

import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EmailDiagnostics } from "@/lib/email/diagnostics";

type DiagnosticsResponse = {
  ok?: boolean;
  diagnostics?: EmailDiagnostics;
  stats?: {
    emailLogsLast24h: number;
    failedNotifications: number;
    pendingNotifications: number;
  };
  error?: string;
};

export default function AdminSystemPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DiagnosticsResponse | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system/email-diagnostics", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as DiagnosticsResponse;
      setData(j);
    } catch {
      setData({ ok: false, error: "שגיאת רשת" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendTestEmail() {
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/system/test-email", {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        to?: string;
        resendId?: string;
        logId?: string;
      };
      if (!j.ok) {
        setTestResult(j.error ?? "שליחה נכשלה");
        return;
      }
      setTestResult(`נשלח בהצלחה ל־${j.to}${j.resendId ? ` (Resend: ${j.resendId})` : ""}`);
      void load();
    } catch {
      setTestResult("שגיאת רשת");
    } finally {
      setTestBusy(false);
    }
  }

  async function retryFailed() {
    setRetryBusy(true);
    try {
      const res = await fetch("/api/admin/system/retry-emails", {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean; retried?: number; error?: string };
      if (!j.ok) {
        setTestResult(j.error ?? "ניסיון שליחה מחדש נכשל");
        return;
      }
      setTestResult(`נוסו מחדש ${j.retried ?? 0} התראות`);
      void load();
    } catch {
      setTestResult("שגיאת רשת בניסיון שליחה מחדש");
    } finally {
      setRetryBusy(false);
    }
  }

  const diag = data?.diagnostics;
  const stats = data?.stats;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8" dir="rtl">
      <header>
        <p className="flex items-center gap-2 text-sm font-bold text-violet-800">
          <Settings className="h-4 w-4" aria-hidden />
          מנהל מערכת
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">הגדרות מערכת — מייל והתראות</h1>
        <p className="mt-1 text-sm text-slate-600">
          אבחון ספק המייל (Resend), שליחת בדיקה, וניסיון שליחה מחדש להתראות שנכשלו.
        </p>
      </header>

      {testResult ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
          {testResult}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <Mail className="h-5 w-5 text-indigo-600" aria-hidden />
            ספק מייל — Resend
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            רענן
          </button>
        </div>

        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            טוען…
          </p>
        ) : diag ? (
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">ספק</dt>
              <dd className="font-semibold">{diag.provider}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">API Key</dt>
              <dd className="font-mono text-xs">
                {diag.apiKeyPresent ? diag.apiKeyPreview : "חסר"}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">מאת (MAIL_FROM)</dt>
              <dd className="font-semibold">{diag.from}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">APP_URL</dt>
              <dd className="font-semibold">{diag.appUrl}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
              <dt className="text-slate-500">מצב בדיקה</dt>
              <dd className="font-semibold">
                {diag.testMode ? `פעיל → ${diag.testRecipient ?? "ללא נמען"}` : "כבוי"}
              </dd>
            </div>
            {stats ? (
              <>
                <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
                  <dt className="text-slate-500">מיילים (24 שעות)</dt>
                  <dd className="font-semibold">{stats.emailLogsLast24h}</dd>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-100 py-2">
                  <dt className="text-slate-500">התראות שנכשלו</dt>
                  <dd className="font-semibold text-red-700">{stats.failedNotifications}</dd>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-slate-500">התראות ממתינות</dt>
                  <dd className="font-semibold text-amber-700">{stats.pendingNotifications}</dd>
                </div>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-red-600">{data?.error ?? "שגיאה בטעינה"}</p>
        )}

        {diag?.issues.length ? (
          <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            {diag.issues.map((issue) => (
              <li key={issue} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {issue}
              </li>
            ))}
          </ul>
        ) : diag?.configured ? (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            תצורת המייל תקינה
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendTestEmail()}
            disabled={testBusy || !diag?.configured}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {testBusy ? <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden /> : null}
            שלח מייל בדיקה
          </button>
          <button
            type="button"
            onClick={() => void retryFailed()}
            disabled={retryBusy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {retryBusy ? <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden /> : null}
            נסה שליחה מחדש להתראות שנכשלו
          </button>
          <Link
            href="/admin/email-logs"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            יומן מיילים
          </Link>
        </div>
      </section>
    </div>
  );
}
