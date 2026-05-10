"use client";

import {
  Check,
  CirclePlus,
  Eye,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteCashFlowEntry,
  fetchCashFlowEntries,
  insertDirectCashFlow,
  updateCashFlowEntry,
} from "@/lib/finance/db";
import { paymentMethodPill, sanitizeCashFlowDescription } from "@/lib/finance/cashflow-display";
import type { CashFlowRow } from "@/lib/finance/types";
import { formatShekel, parseNum } from "@/lib/format-shekel";

const cellPad = "px-3.5 py-2.5";
const rowH = "h-14";

function isZReportCashFlow(row: CashFlowRow): boolean {
  return row.source === "z_report" || Boolean(row.z_report_id);
}

export default function CashflowPage() {
  const [rows, setRows] = useState<CashFlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
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

  const [directOpen, setDirectOpen] = useState(false);
  const [directDate, setDirectDate] = useState("");
  const [directDesc, setDirectDesc] = useState("");
  const [directAmount, setDirectAmount] = useState("");
  const [directSide, setDirectSide] = useState<"debit" | "credit">("credit");
  const [savingDirect, setSavingDirect] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCashFlowEntries();
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
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = filterCustomer.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterType !== "all" && row.entry_type?.toLowerCase() !== filterType) return false;
      if (q && !(row.customer_name ?? "").toLowerCase().includes(q)) return false;
      if (filterDateFrom.trim() && row.entry_date < filterDateFrom.trim()) return false;
      if (filterDateTo.trim() && row.entry_date > filterDateTo.trim()) return false;
      if (filterPaymentMethod && (row.payment_method ?? "").trim() !== filterPaymentMethod) return false;
      return true;
    });
  }, [rows, filterCustomer, filterType, filterDateFrom, filterDateTo, filterPaymentMethod]);

  const totalIn = useMemo(() => filteredRows.reduce((s, r) => s + r.inflow, 0), [filteredRows]);
  const totalOut = useMemo(() => filteredRows.reduce((s, r) => s + r.outflow, 0), [filteredRows]);
  const totalBalance = useMemo(() => totalIn - totalOut, [totalIn, totalOut]);

  const persistPatch = async (row: CashFlowRow, patch: Parameters<typeof updateCashFlowEntry>[1]) => {
    const res = await updateCashFlowEntry(row.id, patch);
    if (!res.ok) {
      setNotice(res.error ?? "שגיאת שמירה");
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
    if (!window.confirm("למחוק תנועה זו מהיומן?")) return;
    const res = await deleteCashFlowEntry(row.id);
    if (!res.ok) {
      setNotice(res.error ?? "מחיקה נכשלה");
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

  const filterInputClass =
    "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

  const compactInput =
    "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm font-medium text-slate-900 outline-none focus:border-luxury-gold focus:ring-1 focus:ring-luxury-gold/25";

  const renderTypeBadgeOnly = (row: CashFlowRow) => {
    const isExp = ["expense", "refund", "supplier_payment", "salary"].includes(row.entry_type?.toLowerCase() ?? "");
    const isZ = !isExp && isZReportCashFlow(row);
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
          isExp ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
        }`}
      >
        {isExp ? (
          <>
            <Minus className="h-3 w-3 shrink-0 stroke-[3]" aria-hidden />
            הוצאה
          </>
        ) : isZ ? (
          <>
            <Plus className="h-3 w-3 shrink-0 stroke-[3]" aria-hidden />
            הכנסה · דוח Z <span aria-hidden>🧾</span>
          </>
        ) : (
          <>
            <Plus className="h-3 w-3 shrink-0 stroke-[3]" aria-hidden />
            הכנסה
          </>
        )}
      </span>
    );
  };

  const renderTypeCell = (row: CashFlowRow) => {
    const isExp = ["expense", "refund", "supplier_payment", "salary"].includes(row.entry_type?.toLowerCase() ?? "");
    const isZ = !isExp && isZReportCashFlow(row);
    return (
      <div className="relative inline-flex items-center gap-1" ref={openTypeMenuId === row.id ? typeMenuRef : undefined}>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
            isExp ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isExp ? (
            <>
              <Minus className="h-3 w-3 shrink-0 stroke-[3]" aria-hidden />
              הוצאה
            </>
          ) : isZ ? (
            <>
              <Plus className="h-3 w-3 shrink-0 stroke-[3]" aria-hidden />
              הכנסה · דוח Z <span aria-hidden>🧾</span>
            </>
          ) : (
            <>
              <Plus className="h-3 w-3 shrink-0 stroke-[3]" aria-hidden />
              הכנסה
            </>
          )}
        </span>
        {isZ ? (
          <span className="rounded-md bg-emerald-50 px-1 py-px text-[9px] font-extrabold uppercase tracking-tight text-emerald-900 ring-1 ring-emerald-200/80">
            Z REPORT
          </span>
        ) : null}
        <button
          type="button"
          title="שינוי סוג"
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
          onClick={() => setOpenTypeMenuId((id) => (id === row.id ? null : row.id))}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        {openTypeMenuId === row.id && (
          <div className="absolute start-0 top-full z-40 mt-1 min-w-[132px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="block w-full px-3 py-2 text-right text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
              onClick={() => void applyEntryType(row, "income")}
            >
              הכנסה
            </button>
            <button
              type="button"
              className="block w-full px-3 py-2 text-right text-xs font-semibold text-rose-900 hover:bg-rose-50"
              onClick={() => void applyEntryType(row, "expense")}
            >
              הוצאה
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderMethodCustomer = (row: CashFlowRow) => {
    const pm = paymentMethodPill(row.payment_method);
    const cust = row.customer_name?.trim();
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {pm ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-800">
            <span aria-hidden>{pm.emoji}</span>
            {pm.label}
          </span>
        ) : null}
        {cust ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-950">
            <span aria-hidden>👤</span>
            {cust}
          </span>
        ) : null}
        {!pm && !cust ? <span className="text-slate-400">—</span> : null}
      </div>
    );
  };

  const renderRowDesktop = (row: CashFlowRow) => {
    const editing = editingRowId === row.id && editForm;

    return (
      <tr key={row.id} className={`${rowH} border-b border-slate-100`}>
        <td className={`${cellPad} align-middle`}>
          {editing ? (
            <input
              type="date"
              className={compactInput}
              value={editForm.entry_date}
              onChange={(e) => setEditForm((f) => (f ? { ...f, entry_date: e.target.value } : f))}
            />
          ) : (
            <span className="text-sm font-medium text-slate-800">{row.entry_date}</span>
          )}
        </td>
        <td className={`${cellPad} align-middle`}>{editing ? renderTypeBadgeOnly(row) : renderTypeCell(row)}</td>
        <td className={`${cellPad} align-middle max-w-[280px]`}>
          {editing ? (
            <input
              type="text"
              className={compactInput}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
            />
          ) : (
            <span className="line-clamp-2 text-sm text-slate-800">{sanitizeCashFlowDescription(row.description)}</span>
          )}
        </td>
        <td className={`${cellPad} align-middle min-w-[160px]`}>
          {editing ? (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                className={compactInput}
                placeholder="אמצעי"
                value={editForm.payment_method}
                onChange={(e) => setEditForm((f) => (f ? { ...f, payment_method: e.target.value } : f))}
              />
              <input
                type="text"
                className={compactInput}
                placeholder="לקוח"
                value={editForm.customer_name}
                onChange={(e) => setEditForm((f) => (f ? { ...f, customer_name: e.target.value } : f))}
              />
            </div>
          ) : (
            renderMethodCustomer(row)
          )}
        </td>
        <td className={`${cellPad} align-middle text-left tabular-nums`}>
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
            <span className="text-sm font-semibold text-emerald-800">{row.inflow > 0 ? formatShekel(row.inflow) : "—"}</span>
          )}
        </td>
        <td className={`${cellPad} align-middle text-left tabular-nums`}>
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
            <span className="text-sm font-semibold text-rose-800">{row.outflow > 0 ? formatShekel(row.outflow) : "—"}</span>
          )}
        </td>
        <td className={`${cellPad} align-middle`}>
          <div className="flex items-center justify-end gap-1">
            {editing ? (
              <>
                <button
                  type="button"
                  title="שמירה"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-800 hover:bg-emerald-100"
                  onClick={() => void saveEdit(row)}
                >
                  <Check className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  title="ביטול"
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                  onClick={cancelEdit}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  title="עריכה"
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 shadow-sm hover:bg-slate-50"
                  onClick={() => startEdit(row)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  title="מחיקה"
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-rose-700 shadow-sm hover:bg-rose-50"
                  onClick={() => void removeRow(row)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
                {row.document_id ? (
                  <Link
                    title="צפייה במסמך"
                    href={`/finance/register?edit=${encodeURIComponent(row.document_id)}`}
                    className="rounded-lg border border-cyan-200 bg-cyan-50 p-1.5 text-cyan-900 hover:bg-cyan-100"
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </Link>
                ) : (
                  <span
                    title="אין מסמך מקושר"
                    className="inline-flex rounded-lg border border-slate-100 bg-slate-50 p-1.5 text-slate-300"
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const renderMobileCard = (row: CashFlowRow) => {
    const editing = editingRowId === row.id && editForm;

    return (
      <div
        key={`m-${row.id}`}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:hidden"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? renderTypeBadgeOnly(row) : renderTypeCell(row)}
          </div>
          {editing && editForm ? (
            <input
              type="date"
              className={`${compactInput} max-w-[140px]`}
              value={editForm.entry_date}
              onChange={(e) => setEditForm((f) => (f ? { ...f, entry_date: e.target.value } : f))}
            />
          ) : (
            <span className="text-xs font-semibold text-slate-500">{row.entry_date}</span>
          )}
        </div>
        <p className="mt-2 text-sm font-medium leading-snug text-slate-900">
          {editing ? (
            <input
              type="text"
              className={`${compactInput} mt-1`}
              value={editForm?.description ?? ""}
              onChange={(e) => setEditForm((f) => (f ? { ...f, description: e.target.value } : f))}
            />
          ) : (
            sanitizeCashFlowDescription(row.description)
          )}
        </p>
        <div className="mt-2">
          {editing && editForm ? (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                className={compactInput}
                placeholder="אמצעי"
                value={editForm.payment_method}
                onChange={(e) => setEditForm((f) => (f ? { ...f, payment_method: e.target.value } : f))}
              />
              <input
                type="text"
                className={compactInput}
                placeholder="לקוח"
                value={editForm.customer_name}
                onChange={(e) => setEditForm((f) => (f ? { ...f, customer_name: e.target.value } : f))}
              />
            </div>
          ) : (
            renderMethodCustomer(row)
          )}
        </div>
        <div className="mt-3 flex justify-between gap-4 border-t border-slate-100 pt-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">כניסה</p>
            {editing && editForm ? (
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${compactInput} mt-1 text-emerald-900`}
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
              <p className="font-bold text-emerald-800">{row.inflow > 0 ? formatShekel(row.inflow) : "—"}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500">יציאה</p>
            {editing && editForm ? (
              <input
                type="number"
                min={0}
                step="0.01"
                className={`${compactInput} mt-1 text-rose-900`}
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
              <p className="font-bold text-rose-800">{row.outflow > 0 ? formatShekel(row.outflow) : "—"}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-3">
          {editing ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-900"
                onClick={() => void saveEdit(row)}
              >
                שמירה
              </button>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700" onClick={cancelEdit}>
                ביטול
              </button>
            </>
          ) : (
            <>
              <button type="button" className="rounded-lg border border-slate-200 p-2 text-slate-700" onClick={() => startEdit(row)}>
                <Pencil className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" className="rounded-lg border border-slate-200 p-2 text-rose-700" onClick={() => void removeRow(row)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
              {row.document_id ? (
                <Link href={`/finance/register?edit=${encodeURIComponent(row.document_id)}`} className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-900">
                  <Eye className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl app-panel p-6 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
            <Wallet className="h-4 w-4" aria-hidden />
            תזרים מזומנים
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950 md:text-3xl">יומן תנועות מזומן</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            רישום תנועות בלבד מטבלת התזרים; ללא יתרות לקוח או חוב פתוח — אלו מוצגים במסכי כרטסות וגבייה.
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
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-luxury-gold px-4 py-2.5 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover"
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

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-800">
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden />
            סה״כ כניסות
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700/90">לפי הסינון בתצוגה</p>
          <p className="mt-1 text-xl font-black text-emerald-900">{formatShekel(totalIn)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-rose-800">
            <Minus className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden />
            סה״כ יציאות
          </p>
          <p className="mt-1 text-xs font-medium text-rose-700/90">לפי הסינון בתצוגה</p>
          <p className="mt-1 text-xl font-black text-rose-900">{formatShekel(totalOut)}</p>
        </div>
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-cyan-900">
            <Wallet className="h-4 w-4 shrink-0" aria-hidden />
            יתרה כללית
          </p>
          <p className="mt-1 text-xs font-medium text-cyan-800/90">כניסות − יציאות (לפי הסינון)</p>
          <p className="mt-1 text-xl font-black text-cyan-950">{formatShekel(totalBalance)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <input
          type="text"
          value={filterCustomer}
          onChange={(e) => setFilterCustomer(e.target.value)}
          className={filterInputClass}
          placeholder="חיפוש לקוח…"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as "all" | "income" | "expense")}
          className={filterInputClass}
        >
          <option value="all">כל הסוגים</option>
          <option value="income">הכנסות בלבד</option>
          <option value="expense">הוצאות בלבד</option>
        </select>
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className={filterInputClass}
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className={filterInputClass}
        />
        <select
          value={filterPaymentMethod}
          onChange={(e) => setFilterPaymentMethod(e.target.value)}
          className={filterInputClass}
        >
          <option value="">כל אמצעי התשלום</option>
          {paymentMethodOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop table */}
      <div className="mt-6 hidden md:block overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
        <table className="min-w-[960px] w-full table-fixed border-collapse text-right text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={`${cellPad} w-[11%] font-bold text-slate-600`}>תאריך</th>
              <th className={`${cellPad} w-[12%] font-bold text-slate-600`}>סוג</th>
              <th className={`${cellPad} w-[28%] font-bold text-slate-600`}>תיאור פעולה</th>
              <th className={`${cellPad} w-[22%] font-bold text-slate-600`}>לקוח / אמצעי</th>
              <th className={`${cellPad} w-[10%] font-bold text-emerald-700`}>כניסה</th>
              <th className={`${cellPad} w-[10%] font-bold text-rose-700`}>יציאה</th>
              <th className={`${cellPad} w-[7%] font-bold text-slate-600`}>פעולות</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center font-semibold text-slate-500">
                  טוען…
                </td>
              </tr>
            )}
            {!loading && filteredRows.map(renderRowDesktop)}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mt-6 space-y-3 md:hidden">
        {loading && <p className="text-center text-sm font-semibold text-slate-500">טוען…</p>}
        {!loading && filteredRows.map(renderMobileCard)}
      </div>

      {!loading && filteredRows.length === 0 && (
        <p className="mt-8 text-center text-sm font-semibold text-slate-500">אין תנועות להצגה.</p>
      )}

      {directOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md app-panel p-6 shadow-xl">
            <h2 className="text-lg font-black text-slate-950">רישום ישירות</h2>
            <p className="mt-1 text-sm text-slate-600">זכות = כניסה, חובה = יציאה.</p>
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
                  <input type="radio" name="side" checked={directSide === "credit"} onChange={() => setDirectSide("credit")} />
                  זכות (כניסה)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold">
                  <input type="radio" name="side" checked={directSide === "debit"} onChange={() => setDirectSide("debit")} />
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
