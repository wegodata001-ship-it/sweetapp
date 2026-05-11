"use client";

import {
  Archive,
  Download,
  ExternalLink,
  Eye,
  FileStack,
  Loader2,
  PackageCheck,
  PencilLine,
  Printer,
  RotateCcw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { deleteFinanceDocument, fetchFinanceDocuments, updateFinanceDocument } from "@/lib/finance/db";
import { REPORT_TYPES } from "@/lib/pdf/constants";
import { DEPOSIT_STATUS_LABELS, DEPOSIT_TYPE_LABELS } from "@/lib/finance/document-payload";
import type { FinanceDocumentRow } from "@/lib/finance/types";

type GeneratedReportRow = {
  id: string;
  type: string;
  title: string;
  relatedId: string | null;
  fileName: string;
  filePath: string;
  publicUrl: string;
  createdAt: string;
  createdBy: { id: string; fullName: string; email: string } | null;
};

const TAB_OPTIONS = [
  { id: "pdf", label: "היסטוריית PDF" },
  { id: "records", label: "רשומות מסמכים במערכת" },
] as const;

function typeBadgeClass(t: string) {
  switch (t) {
    case REPORT_TYPES.INCOME:
      return "bg-emerald-100 text-emerald-950 ring-emerald-200";
    case REPORT_TYPES.EXPENSE:
      return "bg-rose-100 text-rose-950 ring-rose-200";
    case REPORT_TYPES.Z_REPORT:
      return "bg-blue-100 text-blue-950 ring-blue-200";
    case REPORT_TYPES.CASHFLOW:
      return "bg-amber-100 text-amber-950 ring-amber-200";
    case REPORT_TYPES.PAYMENT:
      return "bg-violet-100 text-violet-950 ring-violet-200";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200";
  }
}

function typeLabelHe(t: string) {
  switch (t) {
    case REPORT_TYPES.INCOME:
      return "הכנסה";
    case REPORT_TYPES.EXPENSE:
      return "הוצאה";
    case REPORT_TYPES.Z_REPORT:
      return "דוח Z";
    case REPORT_TYPES.CASHFLOW:
      return "תזרים";
    case REPORT_TYPES.PAYMENT:
      return "תשלום";
    default:
      return t;
  }
}

export default function FinanceArchivePage() {
  const [tab, setTab] = useState<(typeof TAB_OPTIONS)[number]["id"]>("pdf");

  const [rows, setRows] = useState<FinanceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [reports, setReports] = useState<GeneratedReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportQ, setReportQ] = useState("");
  const [reportType, setReportType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GeneratedReportRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await fetchFinanceDocuments();
    setRows(list);
    setLoading(false);
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const params = new URLSearchParams();
      if (reportQ.trim()) params.set("q", reportQ.trim());
      if (reportType) params.set("type", reportType);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/reports?${params}`, { credentials: "same-origin" });
      const j = (await res.json()) as { data?: GeneratedReportRow[] };
      setReports(j.data ?? []);
    } finally {
      setReportsLoading(false);
    }
  }, [reportQ, reportType, dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    queueMicrotask(() => void loadReports());
    // טעינה ראשונית; סינון נוסף בלחיצה על «סינון»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSent = async (id: string, sent: boolean) => {
    const res = await updateFinanceDocument(id, { sent_to_cpa: !sent });
    if (res.ok) await refresh();
  };

  const deleteRow = async (id: string) => {
    const res = await deleteFinanceDocument(id);
    if (res.ok) await refresh();
  };

  const updateDeposit = async (id: string, action: "returned" | "refunded") => {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}/deposit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      credentials: "same-origin",
    });
    if (res.ok) await refresh();
  };

  const confirmDeleteReport = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.ok) await loadReports();
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const btnSm =
    "inline-flex h-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-black transition";

  const filteredReports = useMemo(() => reports, [reports]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="app-panel p-5 md:p-6">
        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-cyan-700">
          <FileStack className="h-4 w-4 shrink-0" aria-hidden />
          ארכיון ומסמכים
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">ניהול מסמכים היסטוריים</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          כל קובץ PDF שנוצר מהכנסות, הוצאות, דוח Z ותזרים נשמר ב־Storage ומופיע כאן. מחיקת מסמך פיננסי אינה מוחקת את ה־PDF מהארכיון.
        </p>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
          {TAB_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-black transition ${
                tab === t.id ? "text-luxury-navy-rich" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
              {tab === t.id ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-luxury-navy-rich" />
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {tab === "pdf" ? (
        <section className="app-panel p-4 md:p-6">
          <div className="grid gap-3 md:grid-cols-12 md:gap-2">
            <label className="md:col-span-4">
              <span className="block text-[11px] font-bold text-slate-500">חיפוש</span>
              <input
                value={reportQ}
                onChange={(e) => setReportQ(e.target.value)}
                placeholder="שם קובץ / כותרת…"
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-right text-sm font-semibold outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/25"
              />
            </label>
            <label className="md:col-span-3">
              <span className="block text-[11px] font-bold text-slate-500">סוג מסמך</span>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-right text-sm font-semibold outline-none focus:border-cyan-600"
              >
                <option value="">הכל</option>
                <option value={REPORT_TYPES.INCOME}>הכנסה</option>
                <option value={REPORT_TYPES.EXPENSE}>הוצאה</option>
                <option value={REPORT_TYPES.Z_REPORT}>דוח Z</option>
                <option value={REPORT_TYPES.CASHFLOW}>תזרים</option>
                <option value={REPORT_TYPES.PAYMENT}>תשלום</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="block text-[11px] font-bold text-slate-500">מתאריך</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm outline-none"
              />
            </label>
            <label className="md:col-span-2">
              <span className="block text-[11px] font-bold text-slate-500">עד תאריך</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm outline-none"
              />
            </label>
            <div className="flex items-end md:col-span-1">
              <button
                type="button"
                onClick={() => void loadReports()}
                className="h-[42px] w-full rounded-lg bg-slate-900 px-3 text-xs font-black text-white hover:bg-slate-800"
              >
                סינון
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[960px] w-full divide-y divide-slate-100 text-right text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">סוג</th>
                  <th className="px-3 py-2">שם מסמך</th>
                  <th className="px-3 py-2">תאריך</th>
                  <th className="px-3 py-2">נוצר ע&quot;י</th>
                  <th className="px-3 py-2">PDF</th>
                  <th className="px-3 py-2">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {reportsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" aria-hidden />
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <Archive className="mx-auto h-12 w-12 text-slate-300" aria-hidden />
                      <p className="mt-3 text-sm font-bold text-slate-500">אין מסמכים היסטוריים</p>
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => (
                    <tr key={r.id} className="min-h-[58px] hover:bg-slate-50/80">
                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${typeBadgeClass(r.type)}`}
                        >
                          {typeLabelHe(r.type)}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-2 align-middle">
                        <span className="line-clamp-2 font-semibold text-slate-900">{r.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{r.fileName}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-slate-600">
                        {new Date(r.createdAt).toLocaleString("he-IL", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-slate-700">
                        {r.createdBy?.fullName ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <button
                          type="button"
                          disabled={!r.publicUrl}
                          onClick={() => setPreview({ url: r.publicUrl, title: r.fileName })}
                          className={`${btnSm} border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100 disabled:opacity-40`}
                        >
                          PDF
                        </button>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            disabled={!r.publicUrl}
                            onClick={() => setPreview({ url: r.publicUrl, title: r.fileName })}
                            className={`${btnSm} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            צפייה
                          </button>
                          <a
                            href={r.publicUrl}
                            download={r.fileName}
                            className={`${btnSm} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            הורדה
                          </a>
                          <button
                            type="button"
                            disabled={!r.publicUrl}
                            onClick={() => setPreview({ url: r.publicUrl, title: r.fileName })}
                            className={`${btnSm} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden />
                            הדפסה
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className={`${btnSm} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            מחיקה
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "records" ? (
        <section className="app-panel p-6 md:p-8">
          <p className="text-sm font-bold text-slate-700">עריכה ובקרת פיקדון — רשומות המסמכים במערכת</p>
          {loading && <p className="mt-6 text-sm font-semibold text-slate-500">טוען…</p>}

          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-[920px] w-full divide-y divide-slate-200 text-right text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-bold text-slate-600">מסמך</th>
                  <th className="px-4 py-3 font-bold text-slate-600">סוג</th>
                  <th className="px-4 py-3 font-bold text-slate-600">תאריך</th>
                  <th className="px-4 py-3 font-bold text-slate-600">פיקדון</th>
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
                      {row.deposit_amount > 0 ? (
                        <div className="space-y-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${
                              row.deposit_status === "open"
                                ? "bg-amber-100 text-amber-950"
                                : row.deposit_status === "refunded"
                                  ? "bg-blue-100 text-blue-900"
                                  : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {DEPOSIT_STATUS_LABELS[row.deposit_status ?? "open"] ?? row.deposit_status}
                          </span>
                          <p className="text-xs font-bold text-slate-700">
                            {(DEPOSIT_TYPE_LABELS[row.deposit_type as keyof typeof DEPOSIT_TYPE_LABELS] ??
                              row.deposit_type ??
                              "פיקדון")}{" "}
                            · {row.deposit_amount.toLocaleString("he-IL")}₪
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/finance/register?edit=${encodeURIComponent(row.id)}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                        >
                          <PencilLine className="h-3.5 w-3.5" aria-hidden />
                          עריכה
                          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                        </Link>
                        <DocumentPdfQuick docId={row.id} onAfter={() => void loadReports()} />
                        <button
                          type="button"
                          onClick={() => void deleteRow(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          מחיקה
                        </button>
                        {row.deposit_amount > 0 && row.deposit_status === "open" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void updateDeposit(row.id, "returned")}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                            >
                              <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                              הפיקדון הוחזר
                            </button>
                            <button
                              type="button"
                              onClick={() => void updateDeposit(row.id, "refunded")}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              החזר פיקדון
                            </button>
                          </>
                        ) : null}
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
        </section>
      ) : null}

      <PdfPreviewModal
        open={Boolean(preview?.url)}
        url={preview?.url ?? ""}
        title={preview?.title ?? ""}
        onClose={() => setPreview(null)}
      />

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <p className="text-lg font-black text-slate-900">למחוק מסמך?</p>
            <p className="mt-2 text-sm text-slate-600">
              הקובץ יימחק מהאחסון והרשומה תוסר מהארכיון. פעולה זו אינה משחזרת מסמך מקור שנמחק.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteReport()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "מוחק…" : "מחק"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocumentPdfQuick({ docId, onAfter }: { docId: string; onAfter: () => void }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);

  const openOrCreate = async () => {
    setBusy(true);
    try {
      const latest = await fetch(`/api/reports/latest?relatedId=${encodeURIComponent(docId)}`, {
        credentials: "same-origin",
      });
      const lj = (await latest.json()) as { data?: { publicUrl: string; fileName: string } | null };
      if (lj.data?.publicUrl) {
        setPreview({ url: lj.data.publicUrl, title: lj.data.fileName });
        return;
      }
      const gen = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entity: "document", relatedId: docId }),
      });
      const gj = (await gen.json()) as { publicUrl?: string; pdfUrl?: string };
      const url = gj.publicUrl ?? gj.pdfUrl;
      if (url) setPreview({ url, title: `doc-${docId.slice(0, 8)}.pdf` });
      onAfter();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void openOrCreate()}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        PDF
      </button>
      <PdfPreviewModal
        open={Boolean(preview)}
        url={preview?.url ?? ""}
        title={preview?.title ?? ""}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
