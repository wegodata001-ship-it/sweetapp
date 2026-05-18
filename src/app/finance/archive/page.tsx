"use client";

import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Clock4,
  Download,
  ExternalLink,
  Eye,
  FileStack,
  History,
  Loader2,
  MoreVertical,
  PackageCheck,
  PencilLine,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useI18n } from "@/components/i18n-provider";
import {
  bulkSetDocumentsAccountantSent,
  deleteFinanceDocument,
  fetchAccountantTransferLog,
  fetchFinanceDocumentsWithCounts,
  setDocumentAccountantSent,
} from "@/lib/finance/db";
import { REPORT_TYPES } from "@/lib/pdf/constants";
import { DEPOSIT_STATUS_LABELS, DEPOSIT_TYPE_LABELS } from "@/lib/finance/document-payload";
import type { AccountantTransferLogRow, FinanceDocumentRow } from "@/lib/finance/types";

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
  { id: "pdf", labelKey: "archive.tabPdfHistory" },
  { id: "records", labelKey: "archive.tabSystemRecords" },
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

function typeLabelKey(t: string): string | null {
  switch (t) {
    case REPORT_TYPES.INCOME:
      return "archive.typeIncome";
    case REPORT_TYPES.EXPENSE:
      return "archive.typeExpense";
    case REPORT_TYPES.Z_REPORT:
      return "archive.typeZReport";
    case REPORT_TYPES.CASHFLOW:
      return "archive.typeCashflow";
    case REPORT_TYPES.PAYMENT:
      return "archive.typePayment";
    default:
      return null;
  }
}

type AccountantFilter = "all" | "sent" | "not_sent";
type DocCounts = { total: number; sent: number; notSent: number };

function formatDateTime(iso: string | null | undefined, bcp47: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(bcp47, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function FinanceArchivePage() {
  const { t, bcp47 } = useI18n();
  const [tab, setTab] = useState<(typeof TAB_OPTIONS)[number]["id"]>("pdf");

  const [rows, setRows] = useState<FinanceDocumentRow[]>([]);
  const [counts, setCounts] = useState<DocCounts>({ total: 0, sent: 0, notSent: 0 });
  const [loading, setLoading] = useState(true);
  const [accountantFilter, setAccountantFilter] = useState<AccountantFilter>("all");
  const [accountantBusyIds, setAccountantBusyIds] = useState<Set<string>>(new Set());
  const [accountantNotice, setAccountantNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [auditOpenId, setAuditOpenId] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<AccountantTransferLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [mobileMenuId, setMobileMenuId] = useState<string | null>(null);

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
    const { rows: list, counts: c } = await fetchFinanceDocumentsWithCounts({ accountant: accountantFilter });
    setRows(list);
    setCounts(c);
    setLoading(false);
  }, [accountantFilter]);

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
    queueMicrotask(() => void refresh());
  }, [refresh]);

  useEffect(() => {
    queueMicrotask(() => void loadReports());
    // טעינה ראשונית; סינון נוסף בלחיצה על «סינון»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markAccountantBusy = (id: string, busy: boolean) => {
    setAccountantBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /** עדכון מיידי של רשומה במקום ב־state בלי refresh מלא */
  const applyUpdatedRow = useCallback((updated: FinanceDocumentRow) => {
    setRows((prev) => {
      // אם הפילטר ״רק לא הועברו״ פעיל וסומן כהועבר — להסיר משורות
      const inFilter =
        accountantFilter === "all" ||
        (accountantFilter === "sent" && updated.sent_to_cpa) ||
        (accountantFilter === "not_sent" && !updated.sent_to_cpa);
      const exists = prev.some((r) => r.id === updated.id);
      if (!inFilter) {
        return prev.filter((r) => r.id !== updated.id);
      }
      if (!exists) return [updated, ...prev];
      return prev.map((r) => (r.id === updated.id ? updated : r));
    });
  }, [accountantFilter]);

  const updateCountsAfterToggle = useCallback((wasSent: boolean, isNowSent: boolean) => {
    setCounts((prev) => {
      if (wasSent === isNowSent) return prev;
      if (!wasSent && isNowSent) {
        return { ...prev, sent: prev.sent + 1, notSent: Math.max(0, prev.notSent - 1) };
      }
      return { ...prev, sent: Math.max(0, prev.sent - 1), notSent: prev.notSent + 1 };
    });
  }, []);

  const toggleAccountant = async (id: string, currentlySent: boolean) => {
    markAccountantBusy(id, true);
    setAccountantNotice(null);
    try {
      const next = !currentlySent;
      const res = await setDocumentAccountantSent(id, next);
      if (!res.ok || !res.data) {
        setAccountantNotice(res.error ?? t("common.errorUpdate"));
        return;
      }
      applyUpdatedRow(res.data);
      updateCountsAfterToggle(currentlySent, next);
      setAccountantNotice(next ? t("archive.toasts.markedSent") : t("archive.toasts.transferCancelled"));
    } finally {
      markAccountantBusy(id, false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkAction = async (sent: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setAccountantNotice(null);
    try {
      const ids = [...selectedIds];
      const res = await bulkSetDocumentsAccountantSent(ids, sent);
      if (!res.ok) {
        setAccountantNotice(res.error ?? t("archive.toasts.bulkFailed"));
        return;
      }
      setAccountantNotice(
        sent
          ? t("archive.toasts.bulkMarked", { count: res.updated ?? 0 })
          : t("archive.toasts.bulkUnmarked", { count: res.updated ?? 0 }),
      );
      clearSelection();
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const openAuditLog = async (id: string) => {
    setAuditOpenId(id);
    setAuditLoading(true);
    setAuditRows([]);
    try {
      const list = await fetchAccountantTransferLog(id);
      setAuditRows(list);
    } finally {
      setAuditLoading(false);
    }
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
          {t("archive.kicker")}
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">{t("archive.manageHistorical")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          {t("archive.intro")}
        </p>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
          {TAB_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTab(opt.id)}
              className={`relative px-4 py-2.5 text-sm font-black transition ${
                tab === opt.id ? "text-luxury-navy-rich" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t(opt.labelKey)}
              {tab === opt.id ? (
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
              <span className="block text-[11px] font-bold text-slate-500">{t("archive.filterSearch")}</span>
              <input
                value={reportQ}
                onChange={(e) => setReportQ(e.target.value)}
                placeholder={t("archive.filterSearchPdfPlaceholder")}
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-right text-sm font-semibold outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/25"
              />
            </label>
            <label className="md:col-span-3">
              <span className="block text-[11px] font-bold text-slate-500">{t("archive.filterDocType")}</span>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-right text-sm font-semibold outline-none focus:border-cyan-600"
              >
                <option value="">{t("archive.filterAll")}</option>
                <option value={REPORT_TYPES.INCOME}>{t("archive.typeIncome")}</option>
                <option value={REPORT_TYPES.EXPENSE}>{t("archive.typeExpense")}</option>
                <option value={REPORT_TYPES.Z_REPORT}>{t("archive.typeZReport")}</option>
                <option value={REPORT_TYPES.CASHFLOW}>{t("archive.typeCashflow")}</option>
                <option value={REPORT_TYPES.PAYMENT}>{t("archive.typePayment")}</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="block text-[11px] font-bold text-slate-500">{t("archive.filterFromDate")}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 h-[42px] w-full rounded-lg border border-slate-300 px-3 text-sm outline-none"
              />
            </label>
            <label className="md:col-span-2">
              <span className="block text-[11px] font-bold text-slate-500">{t("archive.filterToDate")}</span>
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
                {t("archive.applyFilter")}
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[960px] w-full divide-y divide-slate-100 text-right text-sm">
              <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t("archive.thType")}</th>
                  <th className="px-3 py-2">{t("archive.thDocName")}</th>
                  <th className="px-3 py-2">{t("archive.thDate")}</th>
                  <th className="px-3 py-2">{t("archive.thCreatedBy")}</th>
                  <th className="px-3 py-2">{t("archive.thPdf")}</th>
                  <th className="px-3 py-2">{t("archive.thActions")}</th>
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
                      <p className="mt-3 text-sm font-bold text-slate-500">{t("archive.noHistorical")}</p>
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => {
                    const labelKey = typeLabelKey(r.type);
                    return (
                    <tr key={r.id} className="min-h-[58px] hover:bg-slate-50/80">
                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${typeBadgeClass(r.type)}`}
                        >
                          {labelKey ? t(labelKey) : r.type}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-2 align-middle">
                        <span className="line-clamp-2 font-semibold text-slate-900">{r.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{r.fileName}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-middle text-xs text-slate-600">
                        {new Date(r.createdAt).toLocaleString(bcp47, {
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
                          {t("archive.thPdf")}
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
                            {t("archive.view")}
                          </button>
                          <a
                            href={r.publicUrl}
                            download={r.fileName}
                            className={`${btnSm} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            {t("archive.download")}
                          </a>
                          <button
                            type="button"
                            disabled={!r.publicUrl}
                            onClick={() => setPreview({ url: r.publicUrl, title: r.fileName })}
                            className={`${btnSm} border-slate-200 bg-white text-slate-800 hover:bg-slate-50`}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden />
                            {t("archive.print")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            className={`${btnSm} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            {t("archive.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "records" ? (
        <section className="space-y-4">
          <div className="grid gap-2.5 md:grid-cols-3">
            <div className="app-panel flex items-center justify-between gap-3 border-slate-200 p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{t("archive.statTotal")}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-slate-900 md:text-3xl">
                  {counts.total}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{t("archive.statInArchive")}</p>
              </div>
              <span className="rounded-xl bg-slate-100 p-3 text-slate-700">
                <FileStack className="h-6 w-6" aria-hidden />
              </span>
            </div>
            <div className="app-panel flex items-center justify-between gap-3 border-emerald-200 p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{t("archive.statSent")}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700 md:text-3xl">
                  {counts.sent}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-emerald-700/80">{t("archive.statSentTrend")}</p>
              </div>
              <span className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden />
              </span>
            </div>
            <div className="app-panel flex items-center justify-between gap-3 border-amber-200 p-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-amber-800">{t("archive.statPending")}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-amber-800 md:text-3xl">
                  {counts.notSent}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-amber-800/80">
                  {t("archive.statPendingTrend")}
                </p>
              </div>
              <span className="rounded-xl bg-amber-100 p-3 text-amber-800">
                <AlertCircle className="h-6 w-6" aria-hidden />
              </span>
            </div>
          </div>

          <div className="app-panel space-y-4 p-4 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">{t("archive.trackingTitle")}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t("archive.trackingDesc")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "not_sent", "sent"] as AccountantFilter[]).map((f) => {
                  const label =
                    f === "all"
                      ? t("archive.filterAllDocs")
                      : f === "sent"
                        ? t("archive.filterSent")
                        : t("archive.filterNotSent");
                  const num = f === "all" ? counts.total : f === "sent" ? counts.sent : counts.notSent;
                  const active = accountantFilter === f;
                  const colors =
                    f === "sent"
                      ? active
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                      : f === "not_sent"
                        ? active
                          ? "bg-amber-700 text-white border-amber-700"
                          : "text-amber-900 border-amber-200 bg-amber-50 hover:bg-amber-100"
                        : active
                          ? "bg-slate-900 text-white border-slate-900"
                          : "text-slate-800 border-slate-200 bg-white hover:bg-slate-50";
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setAccountantFilter(f);
                        clearSelection();
                      }}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition ${colors}`}
                    >
                      {label}
                      <span className="rounded-full bg-white/30 px-2 py-0.5 text-[10px] tabular-nums">
                        {num}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {accountantNotice ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
                {accountantNotice}
              </p>
            ) : null}

            {selectedIds.size > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-luxury-navy-rich/15 bg-luxury-navy-rich/5 px-4 py-3">
                <p className="text-sm font-black text-luxury-navy-rich">
                  {t("archive.selectedCount", { count: selectedIds.size })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void bulkAction(true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    {t("archive.bulkMarkSent")}
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void bulkAction(false)}
                    className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    {t("archive.bulkCancelSent")}
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    {t("archive.clearSelection")}
                  </button>
                </div>
              </div>
            ) : null}

            {loading ? (
              <p className="text-sm font-semibold text-slate-500">{t("common.loading")}</p>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm font-semibold text-slate-500">
                {accountantFilter === "not_sent"
                  ? t("archive.emptyNotSent")
                  : accountantFilter === "sent"
                    ? t("archive.emptySent")
                    : t("archive.emptyAll")}
              </p>
            ) : (
              <>
                <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
                  <table className="min-w-[1080px] w-full divide-y divide-slate-200 text-right text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="w-[44px] px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === rows.length && rows.length > 0}
                            ref={(el) => {
                              if (el) {
                                el.indeterminate =
                                  selectedIds.size > 0 && selectedIds.size < rows.length;
                              }
                            }}
                            onChange={(e) => {
                              if (e.target.checked) selectAllVisible();
                              else clearSelection();
                            }}
                            className="h-4 w-4 accent-luxury-navy-rich"
                            aria-label={t("archive.selectAllAria")}
                          />
                        </th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thDocument")}</th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thType")}</th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thDate")}</th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thStatusAccountant")}</th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thTransferDate")}</th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thDeposit")}</th>
                        <th className="px-4 py-3 font-bold text-slate-600">{t("archive.thActions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rows.map((row) => {
                        const busy = accountantBusyIds.has(row.id);
                        const selected = selectedIds.has(row.id);
                        return (
                          <tr key={row.id} className={selected ? "bg-luxury-navy-rich/5" : ""}>
                            <td className="px-3 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleSelected(row.id)}
                                className="h-4 w-4 accent-luxury-navy-rich"
                                aria-label={t("archive.selectRowAria", { title: row.title })}
                              />
                            </td>
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
                              {row.sent_to_cpa ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-900">
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.statusSent")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-900">
                                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.statusNotSent")}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {row.sent_to_cpa ? (
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-bold text-slate-700">
                                    {formatDateTime(row.sent_to_cpa_at, bcp47)}
                                  </span>
                                  {row.sent_to_cpa_by ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                      <Users className="h-3 w-3" aria-hidden />
                                      {row.sent_to_cpa_by.full_name}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
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
                                      t("archive.depositFallback"))}{" "}
                                    · {row.deposit_amount.toLocaleString(bcp47)}₪
                                  </p>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-wrap gap-1.5">
                                {row.sent_to_cpa ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void toggleAccountant(row.id, row.sent_to_cpa)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                                  >
                                    {busy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                    {t("archive.actionCancelTransfer")}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void toggleAccountant(row.id, row.sent_to_cpa)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    {busy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                      <Send className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                    {t("archive.actionMarkSent")}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void openAuditLog(row.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                                  title={t("archive.transferHistoryTitle")}
                                >
                                  <History className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.actionLog")}
                                </button>
                                <Link
                                  href={`/finance/register?edit=${encodeURIComponent(row.id)}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-50"
                                >
                                  <PencilLine className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.actionEditDoc")}
                                  <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
                                </Link>
                                <DocumentPdfQuick docId={row.id} onAfter={() => void loadReports()} />
                                <button
                                  type="button"
                                  onClick={() => void deleteRow(row.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.delete")}
                                </button>
                                {row.deposit_amount > 0 && row.deposit_status === "open" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void updateDeposit(row.id, "returned")}
                                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                                    >
                                      <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                                      {t("archive.depositReturned")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void updateDeposit(row.id, "refunded")}
                                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-50"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                      {t("archive.depositRefund")}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-3 md:hidden">
                  {rows.map((row) => {
                    const busy = accountantBusyIds.has(row.id);
                    const selected = selectedIds.has(row.id);
                    const menuOpen = mobileMenuId === row.id;
                    return (
                      <div
                        key={row.id}
                        className={`app-panel relative space-y-3 p-4 ${
                          selected ? "border-luxury-navy-rich/40 bg-luxury-navy-rich/5" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelected(row.id)}
                              className="h-4 w-4 accent-luxury-navy-rich"
                              aria-label={t("archive.selectRowAria", { title: row.title })}
                            />
                            <span className="font-black text-slate-950">{row.title}</span>
                          </label>
                          {row.sent_to_cpa ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-900">
                              <CheckCircle2 className="h-3 w-3" aria-hidden />
                              {t("archive.statusSent")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
                              <AlertCircle className="h-3 w-3" aria-hidden />
                              {t("archive.statusNotSent")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {row.category} · {row.doc_date ?? "—"}
                        </p>
                        {row.sent_to_cpa ? (
                          <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-800">
                            <Clock4 className="h-3 w-3" aria-hidden />
                            {row.sent_to_cpa_by
                              ? t("archive.sentTransferAtBy", {
                                  when: formatDateTime(row.sent_to_cpa_at, bcp47),
                                  name: row.sent_to_cpa_by.full_name,
                                })
                              : t("archive.sentTransferAt", { when: formatDateTime(row.sent_to_cpa_at, bcp47) })}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {row.sent_to_cpa ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleAccountant(row.id, row.sent_to_cpa)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-black text-amber-900 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {t("archive.actionCancelTransfer")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void toggleAccountant(row.id, row.sent_to_cpa)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs font-black text-emerald-800 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Send className="h-3.5 w-3.5" aria-hidden />
                              )}
                              {t("archive.actionMarkSent")}
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={t("archive.moreActionsAria")}
                            onClick={() => setMobileMenuId(menuOpen ? null : row.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-700"
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                        {menuOpen ? (
                          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                            <button
                              type="button"
                              onClick={() => {
                                setMobileMenuId(null);
                                void openAuditLog(row.id);
                              }}
                              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-700"
                            >
                              <History className="h-3.5 w-3.5" aria-hidden />
                              {t("archive.actionLogMobile")}
                            </button>
                            <Link
                              href={`/finance/register?edit=${encodeURIComponent(row.id)}`}
                              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-indigo-700"
                            >
                              <PencilLine className="h-3.5 w-3.5" aria-hidden />
                              {t("archive.actionEditDoc")}
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                setMobileMenuId(null);
                                void deleteRow(row.id);
                              }}
                              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              {t("archive.delete")}
                            </button>
                            {row.deposit_amount > 0 && row.deposit_status === "open" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMobileMenuId(null);
                                    void updateDeposit(row.id, "returned");
                                  }}
                                  className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-emerald-700"
                                >
                                  <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.depositReturned")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMobileMenuId(null);
                                    void updateDeposit(row.id, "refunded");
                                  }}
                                  className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-black text-amber-800"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.depositRefund")}
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {auditOpenId ? (
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="audit-title"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setAuditOpenId(null);
                  setAuditRows([]);
                }
              }}
            >
              <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <h4 id="audit-title" className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <ClipboardCheck className="h-4 w-4 text-luxury-navy-rich" aria-hidden />
                    {t("archive.transferLogTitle")}
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setAuditOpenId(null);
                      setAuditRows([]);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-100"
                  >
                    {t("common.close")}
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-auto p-4">
                  {auditLoading ? (
                    <p className="py-8 text-center text-sm font-semibold text-slate-500">{t("common.loading")}</p>
                  ) : auditRows.length === 0 ? (
                    <p className="py-8 text-center text-sm font-semibold text-slate-500">
                      {t("archive.noLogs")}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {auditRows.map((log) => (
                        <li
                          key={log.id}
                          className={`rounded-xl border px-3 py-2 ${
                            log.action === "marked_sent"
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-black ${
                                log.action === "marked_sent" ? "text-emerald-900" : "text-amber-900"
                              }`}
                            >
                              {log.action === "marked_sent" ? (
                                <>
                                  <Send className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.actionMarkedSent")}
                                </>
                              ) : (
                                <>
                                  <Undo2 className="h-3.5 w-3.5" aria-hidden />
                                  {t("archive.actionUnmarked")}
                                </>
                              )}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-600">
                              {formatDateTime(log.created_at, bcp47)}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                            <Users className="h-3 w-3" aria-hidden />
                            {log.performed_by?.full_name ?? "—"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ) : null}
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
            <p className="text-lg font-black text-slate-900">{t("archive.deleteDocTitle")}</p>
            <p className="mt-2 text-sm text-slate-600">
              {t("archive.deleteDocWarn")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDeleteReport()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? t("common.deleting") : t("common.delete")}
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
