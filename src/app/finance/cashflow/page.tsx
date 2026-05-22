"use client";

import { CirclePlus, Minus, Plus, ScanLine, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CashflowMenuAction } from "@/components/finance/cashflow-row-actions-menu";
import {
  CashflowZReportTableGroupDesktop,
  CashflowZReportTableGroupMobile,
} from "@/components/finance/cashflow-z-report-table-group";
import {
  CashflowDescriptionCell,
  CashflowMethodCustomerCell,
  CashflowRowActions,
  CashflowTypeCell,
} from "@/components/finance/cashflow-table-ui";
import {
  buildJournalDisplayItems,
  groupCashflowByZReport,
  journalDisplayTotals,
  type JournalDisplayItem,
  type ZReportCashflowSummary,
  type ZReportDetailPayload,
  zReportMatchesPaymentFilter,
} from "@/lib/finance/cashflow-z-report";
import { PdfPreviewModal } from "@/components/pdf-preview-modal";
import { useI18n } from "@/components/i18n-provider";
import {
  deleteCashFlowEntry,
  fetchCashFlowEntries,
  insertDirectCashFlow,
  updateCashFlowEntry,
} from "@/lib/finance/db";
import { EXPENSE_TYPE_I18N, EXPENSE_TYPE_VALUES } from "@/lib/finance/expense-types";
import type { CashFlowRow } from "@/lib/finance/types";
import { formatShekel, parseNum } from "@/lib/format-shekel";

const thClass = "text-xs font-semibold text-slate-500";
const rowClass = "cashflow-journal-row max-h-[80px]";

export default function CashflowPage() {
  const { t, bcp47 } = useI18n();
  const router = useRouter();
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterExpenseType, setFilterExpenseType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState("");

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    entry_date: string;
    description: string;
    payment_method: string;
    customer_name: string;
    inflow: number;
    outflow: number;
    entry_type?: string;
  } | null>(null);

  const [openTypeMenuId, setOpenTypeMenuId] = useState<string | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  const [pdfPreview, setPdfPreview] = useState<{ url: string; title: string } | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [expandedZIds, setExpandedZIds] = useState<Set<string>>(new Set());
  const [zDetailById, setZDetailById] = useState<Record<string, ZReportDetailPayload>>({});
  const [zDetailLoadingIds, setZDetailLoadingIds] = useState<Set<string>>(new Set());

  const [directOpen, setDirectOpen] = useState(false);
  const [directDate, setDirectDate] = useState("");
  const [directDesc, setDirectDesc] = useState("");
  const [directAmount, setDirectAmount] = useState("");
  const [directSide, setDirectSide] = useState<"debit" | "credit">("credit");
  const [savingDirect, setSavingDirect] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCashFlowEntries(
        filterType === "all"
          ? undefined
          : {
              entryType: filterType,
              expenseType:
                filterType === "expense" && filterExpenseType ? filterExpenseType : undefined,
            },
      );
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterExpenseType]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll();
    });
  }, [loadAll]);

  useEffect(() => {
    if (filterType !== "expense") setFilterExpenseType("");
  }, [filterType]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!openTypeMenuId) return;
      const el = typeMenuRef.current;
      if (el && !el.contains(e.target as Node)) setOpenTypeMenuId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openTypeMenuId]);

  const paymentMethodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const p = r.payment_method?.trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, bcp47));
  }, [rows, bcp47]);

  const filteredRows = useMemo(() => {
    const q = filterCustomer.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !(row.customer_name ?? "").toLowerCase().includes(q)) return false;
      if (filterDateFrom.trim() && row.entry_date < filterDateFrom.trim()) return false;
      if (filterDateTo.trim() && row.entry_date > filterDateTo.trim()) return false;
      if (filterPaymentMethod && (row.payment_method ?? "").trim() !== filterPaymentMethod) return false;
      return true;
    });
  }, [rows, filterCustomer, filterDateFrom, filterDateTo, filterPaymentMethod]);

  const zGroups = useMemo(() => groupCashflowByZReport(filteredRows), [filteredRows]);

  const journalItems = useMemo((): JournalDisplayItem[] => {
    const q = filterCustomer.trim().toLowerCase();
    const items = buildJournalDisplayItems(filteredRows);
    if (!filterPaymentMethod.trim()) return items;
    return items.filter((item) => {
      if (item.kind === "row") {
        return (item.row.payment_method ?? "").trim() === filterPaymentMethod.trim();
      }
      const lines = zGroups.get(item.summary.zReportId) ?? [];
      return zReportMatchesPaymentFilter(item.summary, lines, filterPaymentMethod);
    });
  }, [filteredRows, filterPaymentMethod, zGroups]);

  const { totalIn, totalOut } = useMemo(() => journalDisplayTotals(journalItems), [journalItems]);

  const toggleZExpand = useCallback(
    async (zReportId: string) => {
      if (expandedZIds.has(zReportId)) {
        setExpandedZIds((prev) => {
          const next = new Set(prev);
          next.delete(zReportId);
          return next;
        });
        return;
      }
      setExpandedZIds((prev) => new Set(prev).add(zReportId));
      if (zDetailById[zReportId]) return;

      setZDetailLoadingIds((prev) => new Set(prev).add(zReportId));
      try {
        const res = await fetch(`/api/cashflow/z-report/${encodeURIComponent(zReportId)}`, {
          credentials: "same-origin",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          data?: ZReportDetailPayload;
        };
        if (res.ok && json.ok && json.data) {
          setZDetailById((prev) => ({ ...prev, [zReportId]: json.data! }));
        }
      } finally {
        setZDetailLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(zReportId);
          return next;
        });
      }
    },
    [expandedZIds, zDetailById],
  );

  const zGroupDetailProps = (summary: ZReportCashflowSummary) => {
    const detail = zDetailById[summary.zReportId];
    return {
      expanded: expandedZIds.has(summary.zReportId),
      onToggle: () => void toggleZExpand(summary.zReportId),
      detailLines: detail?.lines ?? null,
      detailTime: detail?.summary.time ?? null,
      detailStatus: detail?.summary.status ?? null,
      detailCashier: detail?.summary.cashierLabel ?? null,
      loadingDetail: zDetailLoadingIds.has(summary.zReportId),
    };
  };
  const totalBalance = useMemo(() => totalIn - totalOut, [totalIn, totalOut]);

  const persistPatch = async (row: CashFlowRow, patch: Parameters<typeof updateCashFlowEntry>[1]) => {
    const res = await updateCashFlowEntry(row.id, patch);
    if (!res.ok) {
      setNotice(res.error ?? t("cashflow.errorSave"));
      return false;
    }
    setNotice(null);
    await loadAll();
    return true;
  };

  const applyEntryType = async (row: CashFlowRow, next: "income" | "expense") => {
    const amt = Math.max(row.inflow, row.outflow);
    if (next === "income") {
      await persistPatch(row, { entry_type: "income", inflow: amt, outflow: 0 });
    } else {
      await persistPatch(row, { entry_type: "expense", inflow: 0, outflow: amt });
    }
    setOpenTypeMenuId(null);
  };

  const startEdit = (row: CashFlowRow) => {
    setEditingRowId(row.id);
    setEditForm({
      entry_date: row.entry_date,
      description: row.description,
      payment_method: row.payment_method ?? "",
      customer_name: row.customer_name ?? "",
      inflow: row.inflow,
      outflow: row.outflow,
      entry_type: row.entry_type,
    });
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditForm(null);
  };

  const saveEdit = async (row: CashFlowRow) => {
    if (!editForm) return;
    const inf = Math.max(0, editForm.inflow);
    const outf = Math.max(0, editForm.outflow);
    const ok = await persistPatch(row, {
      entry_date: editForm.entry_date,
      description: editForm.description.trim(),
      payment_method: editForm.payment_method.trim(),
      customer_name: editForm.customer_name.trim(),
      inflow: inf,
      outflow: outf,
    });
    if (ok) cancelEdit();
  };

  const removeRow = async (row: CashFlowRow) => {
    if (!window.confirm(t("cashflow.confirmDelete"))) return;
    const res = await deleteCashFlowEntry(row.id);
    if (!res.ok) {
      setNotice(res.error ?? t("common.errorDelete"));
      return;
    }
    setNotice(null);
    if (editingRowId === row.id) cancelEdit();
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    await loadAll();
  };

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseNum(directAmount);
    const amt = parsed >= 0 ? parsed : -parsed;
    if (!directDate || !Number.isFinite(amt) || amt <= 0) {
      setNotice(t("cashflow.fillDateAmount"));
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
      setNotice(res.error ?? t("common.error"));
      return;
    }
    setNotice(null);
    setDirectOpen(false);
    setDirectDesc("");
    setDirectAmount("");
    await loadAll();
  };

  const filterInputClass =
    "h-14 min-h-[56px] w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-0 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

  const compactInput =
    "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-medium text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

  const duplicateRow = async (row: CashFlowRow) => {
    const amt = Math.max(row.inflow, row.outflow);
    if (amt <= 0) return;
    const side = row.inflow > 0 ? "credit" : "debit";
    const suffix = t("cashflow.duplicateSuffix");
    const desc = row.description?.trim()
      ? `${row.description.trim()} ${suffix}`
      : suffix.trim();
    const res = await insertDirectCashFlow({
      entry_date: row.entry_date,
      description: desc,
      side,
      amount: amt,
    });
    if (!res.ok) {
      setNotice(res.error ?? t("common.error"));
      return;
    }
    setNotice(null);
    await loadAll();
  };

  const removeZReportDocument = async (documentId: string) => {
    if (!window.confirm(t("cashflow.zReport.confirmDeleteDocument"))) return;
    const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setNotice(json.error ?? t("common.errorDelete"));
      return;
    }
    setNotice(null);
    setExpandedZIds((prev) => {
      const next = new Set(prev);
      next.delete(documentId);
      return next;
    });
    setZDetailById((prev) => {
      const next = { ...prev };
      delete next[documentId];
      return next;
    });
    await loadAll();
  };

  const openDocumentPdf = async (documentId: string) => {
    setPdfBusyId(documentId);
    try {
      const latest = await fetch(`/api/reports/latest?relatedId=${encodeURIComponent(documentId)}`, {
        credentials: "same-origin",
      });
      const lj = (await latest.json()) as { data?: { publicUrl: string; fileName: string } | null };
      if (lj.data?.publicUrl) {
        setPdfPreview({ url: lj.data.publicUrl, title: lj.data.fileName });
        return;
      }
      const gen = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entity: "document", relatedId: documentId }),
      });
      const gj = (await gen.json()) as { publicUrl?: string; pdfUrl?: string };
      const url = gj.publicUrl ?? gj.pdfUrl;
      if (url) setPdfPreview({ url, title: `z-report-${documentId.slice(0, 8)}.pdf` });
    } finally {
      setPdfBusyId(null);
    }
  };

  const handleZReportMenuAction = (summary: ZReportCashflowSummary, action: CashflowMenuAction) => {
    const docId = summary.documentId;
    switch (action) {
      case "edit":
        router.push(`/finance/register?edit=${encodeURIComponent(docId)}`);
        break;
      case "delete":
        void removeZReportDocument(docId);
        break;
      case "pdf":
      case "print":
        void openDocumentPdf(docId);
        break;
      default:
        break;
    }
  };

  const handleRowMenuAction = (row: CashFlowRow, action: CashflowMenuAction) => {
    switch (action) {
      case "view":
        if (row.document_id) {
          router.push(`/finance/register?edit=${encodeURIComponent(row.document_id)}`);
        }
        break;
      case "edit":
        startEdit(row);
        break;
      case "delete":
        void removeRow(row);
        break;
      case "pdf":
        void openCashflowPdf(row.id);
        break;
      case "print":
        if (row.document_id) void openDocumentPdf(row.document_id);
        else void openCashflowPdf(row.id);
        break;
      case "duplicate":
        void duplicateRow(row);
        break;
      case "addPayment":
        if (row.document_id) {
          router.push(`/finance/register?edit=${encodeURIComponent(row.document_id)}`);
        } else {
          const tab = row.entry_type === "expense" ? "expenses" : "income";
          router.push(`/finance/register?tab=${tab}`);
        }
        break;
      case "generateDocument": {
        const tab = row.entry_type === "expense" ? "expenses" : "income";
        router.push(`/finance/register?tab=${tab}`);
        break;
      }
      default:
        break;
    }
  };

  const openCashflowPdf = async (rowId: string) => {
    setPdfBusyId(rowId);
    try {
      const latest = await fetch(`/api/reports/latest?relatedId=${encodeURIComponent(rowId)}`, {
        credentials: "same-origin",
      });
      const lj = (await latest.json()) as { data?: { publicUrl: string; fileName: string } | null };
      if (lj.data?.publicUrl) {
        setPdfPreview({ url: lj.data.publicUrl, title: lj.data.fileName });
        return;
      }
      const gen = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entity: "cashflow", relatedId: rowId }),
      });
      const gj = (await gen.json()) as { publicUrl?: string; pdfUrl?: string };
      const url = gj.publicUrl ?? gj.pdfUrl;
      if (url) setPdfPreview({ url, title: `cashflow-${rowId.slice(0, 8)}.pdf` });
    } finally {
      setPdfBusyId(null);
    }
  };

  const renderRowDesktop = (row: CashFlowRow, nested = false) => {
    const editing = editingRowId === row.id && editForm;

    return (
      <tr
        key={row.id}
        className={`${rowClass} ${nested ? "border-slate-100 bg-slate-50/40" : ""}`}
      >
        <td className={`align-middle ${nested ? "relative ps-10" : ""}`}>
          {nested ? (
            <span
              className="absolute start-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-slate-300"
              aria-hidden
            />
          ) : null}
          {editing ? (
            <input
              type="date"
              className={compactInput}
              value={editForm.entry_date}
              onChange={(e) => setEditForm((f) => (f ? { ...f, entry_date: e.target.value } : f))}
            />
          ) : (
            <span className="text-[13px] font-medium text-slate-700">{row.entry_date}</span>
          )}
        </td>
        <td className="align-middle">
          <CashflowTypeCell
            row={row}
            editable={!editing}
            menuOpen={openTypeMenuId === row.id}
            menuRef={openTypeMenuId === row.id ? typeMenuRef : undefined}
            onToggleMenu={() => setOpenTypeMenuId((id) => (id === row.id ? null : row.id))}
            onPickIncome={() => void applyEntryType(row, "income")}
            onPickExpense={() => void applyEntryType(row, "expense")}
          />
        </td>
        <td className="align-middle">
          {editing ? (
            <input
              type="text"
              className={compactInput}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
            />
          ) : (
            <CashflowDescriptionCell description={row.description} />
          )}
        </td>
        <td className="align-middle">
          {editing ? (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                className={compactInput}
                placeholder={t("cashflow.thMethod")}
                value={editForm.payment_method}
                onChange={(e) => setEditForm((f) => (f ? { ...f, payment_method: e.target.value } : f))}
              />
              <input
                type="text"
                className={compactInput}
                placeholder={t("entities.customer")}
                value={editForm.customer_name}
                onChange={(e) => setEditForm((f) => (f ? { ...f, customer_name: e.target.value } : f))}
              />
            </div>
          ) : (
            <CashflowMethodCustomerCell row={row} />
          )}
        </td>
        <td className="align-middle text-end tabular-nums">
          {editing ? (
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${compactInput} text-emerald-800`}
              value={editForm.inflow || ""}
              onChange={(e) =>
                setEditForm((f) =>
                  f
                    ? {
                        ...f,
                        inflow: parseNum(e.target.value),
                        outflow: parseNum(e.target.value) > 0 ? 0 : f.outflow,
                      }
                    : f,
                )
              }
            />
          ) : (
            <span className="text-[13px] font-semibold text-emerald-700">
              {row.inflow > 0 ? formatShekel(row.inflow) : "—"}
            </span>
          )}
        </td>
        <td className="align-middle text-end tabular-nums">
          {editing ? (
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${compactInput} text-rose-800`}
              value={editForm.outflow || ""}
              onChange={(e) =>
                setEditForm((f) =>
                  f
                    ? {
                        ...f,
                        outflow: parseNum(e.target.value),
                        inflow: parseNum(e.target.value) > 0 ? 0 : f.inflow,
                      }
                    : f,
                )
              }
            />
          ) : (
            <span className="text-[13px] font-semibold text-rose-700">
              {row.outflow > 0 ? formatShekel(row.outflow) : "—"}
            </span>
          )}
        </td>
        <td className="align-middle">
          <CashflowRowActions
            row={row}
            editing={Boolean(editing)}
            onSave={() => void saveEdit(row)}
            onCancel={cancelEdit}
            pdfBusy={pdfBusyId === row.id}
            onMenuAction={(action) => handleRowMenuAction(row, action)}
          />
        </td>
      </tr>
    );
  };

  const renderMobileCard = (row: CashFlowRow, nested = false) => {
    const editing = editingRowId === row.id && editForm;

    return (
      <article
        key={`m-${row.id}`}
        className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:bg-[#fafafa] ${
          nested ? "border-slate-100 bg-slate-50/90" : "md:hidden"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <CashflowTypeCell row={row} editable={false} />
          {editing && editForm ? (
            <input
              type="date"
              className={`${compactInput} max-w-[132px] shrink-0`}
              value={editForm.entry_date}
              onChange={(e) => setEditForm((f) => (f ? { ...f, entry_date: e.target.value } : f))}
            />
          ) : (
            <span className="shrink-0 text-[12px] font-medium text-slate-500">{row.entry_date}</span>
          )}
        </div>
        <div className="mt-2">
          {editing ? (
            <input
              type="text"
              className={compactInput}
              value={editForm?.description ?? ""}
              onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
            />
          ) : (
            <CashflowDescriptionCell description={row.description} />
          )}
        </div>
        <div className="mt-2">
          {editing && editForm ? (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                className={compactInput}
                placeholder={t("cashflow.thMethod")}
                value={editForm.payment_method}
                onChange={(e) => setEditForm((f) => (f ? { ...f, payment_method: e.target.value } : f))}
              />
              <input
                type="text"
                className={compactInput}
                placeholder={t("entities.customer")}
                value={editForm.customer_name}
                onChange={(e) => setEditForm((f) => (f ? { ...f, customer_name: e.target.value } : f))}
              />
            </div>
          ) : (
            <CashflowMethodCustomerCell row={row} />
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
          <div>
            <p className="text-[11px] font-medium text-slate-500">{t("cashflow.thIncoming")}</p>
            {editing && editForm ? (
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${compactInput} mt-1`}
                value={editForm.inflow || ""}
                onChange={(e) =>
                  setEditForm((f) =>
                    f
                      ? {
                          ...f,
                          inflow: parseNum(e.target.value),
                          outflow: parseNum(e.target.value) > 0 ? 0 : f.outflow,
                        }
                      : f,
                  )
                }
              />
            ) : (
              <p className="mt-0.5 text-[13px] font-semibold text-emerald-700">
                {row.inflow > 0 ? formatShekel(row.inflow) : "—"}
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">{t("cashflow.thOutgoing")}</p>
            {editing && editForm ? (
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${compactInput} mt-1`}
                value={editForm.outflow || ""}
                onChange={(e) =>
                  setEditForm((f) =>
                    f
                      ? {
                          ...f,
                          outflow: parseNum(e.target.value),
                          inflow: parseNum(e.target.value) > 0 ? 0 : f.inflow,
                        }
                      : f,
                  )
                }
              />
            ) : (
              <p className="mt-0.5 text-[13px] font-semibold text-rose-700">
                {row.outflow > 0 ? formatShekel(row.outflow) : "—"}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
          <CashflowRowActions
            row={row}
            editing={Boolean(editing)}
            onSave={() => void saveEdit(row)}
            onCancel={cancelEdit}
            pdfBusy={pdfBusyId === row.id}
            onMenuAction={(action) => handleRowMenuAction(row, action)}
          />
        </div>
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-7xl app-panel mb-[14px] p-4 md:p-[18px]">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-cyan-700 opacity-80">
            <Wallet className="h-4 w-4" aria-hidden />
            {t("cashflow.kicker")}
          </p>
          <h1 className="erp-page-title mt-1.5 text-slate-950">{t("cashflow.journalTitle")}</h1>
          <p className="mt-1 max-w-3xl text-[14px] leading-snug text-slate-600 opacity-80">
            {t("cashflow.journalSubtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <Link
            href="/finance/register?tab=expenses&scan=1"
            className="erp-btn gap-2 border border-rose-200 bg-rose-50 text-rose-900 shadow-sm hover:bg-rose-100"
          >
            <ScanLine className="h-4 w-4" aria-hidden />
            {t("cashflow.scanExpense")}
          </Link>
          <button
            type="button"
            onClick={() => {
              const d = new Date();
              const pad = (n: number) => String(n).padStart(2, "0");
              setDirectDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
              setDirectOpen(true);
            }}
            className="erp-btn gap-2 bg-luxury-gold text-luxury-charcoal shadow-sm hover:bg-luxury-gold-hover"
          >
            <CirclePlus className="h-4 w-4" aria-hidden />
            {t("cashflow.directEntry")}
          </button>
        </div>
      </div>

      {notice && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">
          {notice}
        </p>
      )}

      <div className="mt-[14px] grid gap-2.5 sm:grid-cols-3">
        <div className="flex h-[120px] flex-col justify-between rounded-[18px] border border-emerald-200 bg-emerald-50/70 p-[14px] shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden />
            {t("cashflow.totalIncoming")}
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700/90">{t("cashflow.byFilter")}</p>
          <p className="mt-1 text-xl font-black text-emerald-900">{formatShekel(totalIn)}</p>
        </div>
        <div className="flex h-[120px] flex-col justify-between rounded-[18px] border border-rose-200 bg-rose-50/70 p-[14px] shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <Minus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden />
            {t("cashflow.totalOutgoing")}
          </p>
          <p className="mt-1 text-xs font-medium text-rose-700/90">{t("cashflow.byFilter")}</p>
          <p className="mt-1 text-xl font-black text-rose-900">{formatShekel(totalOut)}</p>
        </div>
        <div className="flex h-[120px] flex-col justify-between rounded-[18px] border border-cyan-200 bg-cyan-50/80 p-[14px] shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-cyan-900">
            <Wallet className="h-4 w-4 shrink-0" aria-hidden />
            {t("cashflow.generalBalance")}
          </p>
          <p className="mt-1 text-xs font-medium text-cyan-800/90">{t("cashflow.generalBalanceHelp")}</p>
          <p className="mt-1 text-xl font-black text-cyan-950">{formatShekel(totalBalance)}</p>
        </div>
      </div>

      <div className="mt-[14px] flex min-h-[56px] flex-wrap items-center gap-2.5 rounded-[18px] border border-slate-100 bg-slate-50/80 p-3 shadow-sm">
        <input
          type="text"
          value={filterCustomer}
          onChange={(e) => setFilterCustomer(e.target.value)}
          className={`${filterInputClass} min-w-[10rem] flex-1`}
          placeholder={t("cashflow.searchCustomer")}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "all" | "income" | "expense")}
          className={`${filterInputClass} min-w-[10rem] flex-1`}
        >
          <option value="all">{t("cashflow.allTypes")}</option>
          <option value="income">{t("cashflow.incomeOnly")}</option>
          <option value="expense">{t("cashflow.expenseOnly")}</option>
        </select>
        {filterType === "expense" ? (
          <select
            value={filterExpenseType}
            onChange={(e) => setFilterExpenseType(e.target.value)}
            className={`${filterInputClass} min-w-[11rem] flex-1 motion-safe:animate-[cashflowFilterIn_0.2s_ease-out]`}
            aria-label={t("cashflow.expenseTypeFilter")}
          >
            <option value="">{t("cashflow.allExpenseTypes")}</option>
            {EXPENSE_TYPE_VALUES.map((type) => (
              <option key={type} value={type}>
                {t(EXPENSE_TYPE_I18N[type])}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className={`${filterInputClass} min-w-[9rem] flex-1`}
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className={`${filterInputClass} min-w-[9rem] flex-1`}
        />
        <select
          value={filterPaymentMethod}
          onChange={(e) => setFilterPaymentMethod(e.target.value)}
          className={`${filterInputClass} min-w-[10rem] flex-1`}
        >
          <option value="">{t("cashflow.allPaymentMethods")}</option>
          {paymentMethodOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop table — שורות רגילות + דוחות Z מקובצים */}
      <div className="mt-6 hidden md:block overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
        <table className="cashflow-journal-table min-w-[920px] w-full table-fixed border-collapse text-right text-sm">
          <thead>
            <tr>
              <th className={`${thClass} w-[10%]`}>{t("cashflow.thDate")}</th>
              <th className={`${thClass} w-[12%]`}>{t("cashflow.thType")}</th>
              <th className={`${thClass} w-[30%]`}>{t("cashflow.thActionDescription")}</th>
              <th className={`${thClass} w-[20%]`}>{t("cashflow.thCustomerOrMethod")}</th>
              <th className={`${thClass} w-[10%] text-emerald-700`}>{t("cashflow.thIncoming")}</th>
              <th className={`${thClass} w-[10%] text-rose-700`}>{t("cashflow.thOutgoing")}</th>
              <th className={`${thClass} w-[4%] min-w-[48px]`}>{t("cashflow.thActions")}</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm font-medium text-slate-500">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!loading && journalItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm font-medium text-slate-500">
                  {t("cashflow.noEntriesShown")}
                </td>
              </tr>
            ) : null}
            {!loading &&
              journalItems.map((item) =>
                item.kind === "z" ? (
                  <CashflowZReportTableGroupDesktop
                    key={`z-${item.summary.zReportId}`}
                    summary={item.summary}
                    pdfBusy={pdfBusyId === item.summary.documentId}
                    onMenuAction={(action) => handleZReportMenuAction(item.summary, action)}
                    renderDesktopRow={renderRowDesktop}
                    renderMobileRow={renderMobileCard}
                    {...zGroupDetailProps(item.summary)}
                  />
                ) : (
                  renderRowDesktop(item.row)
                ),
              )}
          </tbody>
        </table>
      </div>

      {/* Mobile — שורות רגילות + דוחות Z מקובצים */}
      <div className="mt-6 space-y-3 md:hidden">
        {loading && <p className="text-center text-sm font-semibold text-slate-500">{t("common.loading")}</p>}
        {!loading &&
          journalItems.map((item) =>
            item.kind === "z" ? (
              <CashflowZReportTableGroupMobile
                key={`z-m-${item.summary.zReportId}`}
                summary={item.summary}
                pdfBusy={pdfBusyId === item.summary.documentId}
                onMenuAction={(action) => handleZReportMenuAction(item.summary, action)}
                renderDesktopRow={renderRowDesktop}
                renderMobileRow={renderMobileCard}
                {...zGroupDetailProps(item.summary)}
              />
            ) : (
              renderMobileCard(item.row)
            ),
          )}
      </div>

      {!loading && journalItems.length === 0 && (
        <p className="mt-8 text-center text-sm font-semibold text-slate-500">
          {filterType === "expense" && filterExpenseType
            ? t("cashflow.noExpenseTypeEntries")
            : t("cashflow.noEntriesShown")}
        </p>
      )}

      {directOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md app-panel p-6 shadow-xl">
            <h2 className="text-lg font-black text-slate-950">{t("cashflow.directEntry")}</h2>
            <p className="mt-1 text-sm text-slate-600">{t("cashflow.directEntryHelp")}</p>
            <form className="mt-4 space-y-4" onSubmit={handleDirectSubmit}>
              <label className="block text-sm font-bold text-slate-800">
                {t("common.date")}
                <input
                  type="date"
                  required
                  value={directDate}
                  onChange={(e) => setDirectDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right"
                />
              </label>
              <label className="block text-sm font-bold text-slate-800">
                {t("common.description")}
                <input
                  type="text"
                  value={directDesc}
                  onChange={(e) => setDirectDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right"
                  placeholder={t("cashflow.directEntryDescPlaceholder")}
                />
              </label>
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input type="radio" name="side" checked={directSide === "credit"} onChange={() => setDirectSide("credit")} />
                  {t("cashflow.creditIn")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input type="radio" name="side" checked={directSide === "debit"} onChange={() => setDirectSide("debit")} />
                  {t("cashflow.debitOut")}
                </label>
              </div>
              <label className="block text-sm font-bold text-slate-800">
                {t("common.amount")}
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
                  {savingDirect ? t("common.saving") : t("cashflow.actionSave")}
                </button>
                <button
                  type="button"
                  onClick={() => setDirectOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PdfPreviewModal
        open={Boolean(pdfPreview?.url)}
        url={pdfPreview?.url ?? ""}
        title={pdfPreview?.title ?? ""}
        onClose={() => setPdfPreview(null)}
      />
    </div>
  );
}

