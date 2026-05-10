"use client";

import { BookMarked, ChevronLeft, ChevronRight, Eye, Filter, Pencil, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchEntitiesByType,
  fetchLedgerForFilters,
  fetchLedgerOverview,
  type LedgerOverviewResponse,
} from "@/lib/finance/db";
import type { EntityType, FinanceEntityRow, LedgerMovementView, LedgerOverviewRow } from "@/lib/finance/types";
import { formatShekel } from "@/lib/format-shekel";
import { withLedgerRunningBalances } from "@/lib/running-calcs";

const entityLabels: Record<EntityType, string> = {
  supplier: "ספק",
  customer: "לקוח",
  employee: "עובד",
};

type EntityFilter = "all" | EntityType;

type Filters = {
  q: string;
  entityType: EntityFilter;
  entityId: string;
  dateFrom: string;
  dateTo: string;
};

function emptyFilters(): Filters {
  return { q: "", entityType: "all", entityId: "", dateFrom: "", dateTo: "" };
}

function parseDetailParam(raw: string | null): { type: EntityType; id: string } | null {
  if (!raw?.trim()) return null;
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const type = raw.slice(0, colon) as EntityType;
  const id = raw.slice(colon + 1);
  if (!id || !["customer", "supplier", "employee"].includes(type)) return null;
  return { type, id };
}

function LedgersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState<Filters>(() => emptyFilters());
  const [applied, setApplied] = useState<Filters>(() => emptyFilters());

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [overview, setOverview] = useState<LedgerOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityPicker, setEntityPicker] = useState<FinanceEntityRow[]>([]);

  const [detail, setDetail] = useState<{ type: EntityType; id: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpening, setDetailOpening] = useState(0);
  const [detailMovements, setDetailMovements] = useState<LedgerMovementView[]>([]);
  const [detailName, setDetailName] = useState("");

  const [editRow, setEditRow] = useState<LedgerOverviewRow | null>(null);
  const [editOpeningInput, setEditOpeningInput] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const parsed = parseDetailParam(searchParams.get("detail"));
    queueMicrotask(() => setDetail(parsed));
  }, [searchParams]);

  useEffect(() => {
    const et = draft.entityType;
    if (et === "all") {
      queueMicrotask(() => setEntityPicker([]));
      return;
    }
    let cancelled = false;
    void (async () => {
      const list = await fetchEntitiesByType(et);
      if (!cancelled) setEntityPicker(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.entityType]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchLedgerOverview({
        q: applied.q || undefined,
        entityType: applied.entityType,
        entityId: applied.entityId || undefined,
        dateFrom: applied.dateFrom || null,
        dateTo: applied.dateTo || null,
        page,
        pageSize,
      });
      setOverview(res);
    } catch {
      setError("טעינת כרטסות נכשלה.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [applied, page, pageSize]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadOverview();
    });
  }, [loadOverview]);

  const loadDetail = useCallback(async () => {
    if (!detail) {
      setDetailMovements([]);
      setDetailName("");
      return;
    }
    setDetailLoading(true);
    try {
      const res = await fetchLedgerForFilters({
        entityType: detail.type,
        entityId: detail.id,
        dateFrom: applied.dateFrom || null,
        dateTo: applied.dateTo || null,
      });
      setDetailOpening(res.opening);
      setDetailMovements(res.movements);
      setDetailName(res.entityName);
    } catch {
      setDetailMovements([]);
      setDetailName("");
    } finally {
      setDetailLoading(false);
    }
  }, [detail, applied.dateFrom, applied.dateTo]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadDetail();
    });
  }, [loadDetail]);

  const rowsWithBalance = useMemo(
    () => withLedgerRunningBalances(detailMovements, detailOpening),
    [detailMovements, detailOpening],
  );

  const applyFilters = () => {
    const next = { ...draft };
    if (next.entityType === "all") next.entityId = "";
    setApplied(next);
    setPage(1);
  };

  const clearFilters = () => {
    const next = emptyFilters();
    setDraft(next);
    setApplied(next);
    setPage(1);
  };

  const setDetailUrl = (next: { type: EntityType; id: string } | null) => {
    setDetail(next);
    if (next) {
      router.replace(`/finance/ledgers?detail=${next.type}:${encodeURIComponent(next.id)}`, { scroll: false });
    } else {
      router.replace("/finance/ledgers", { scroll: false });
    }
  };

  const openEdit = (row: LedgerOverviewRow) => {
    setEditRow(row);
    setEditOpeningInput(String(row.opening_balance ?? 0));
  };

  const saveEditOpening = async () => {
    if (!editRow) return;
    const val = Number(editOpeningInput.replace(/,/g, "."));
    if (Number.isNaN(val)) {
      return;
    }
    setSavingEdit(true);
    try {
      const url =
        editRow.entity_type === "customer"
          ? `/api/customers/${encodeURIComponent(editRow.id)}`
          : editRow.entity_type === "supplier"
            ? `/api/suppliers/${encodeURIComponent(editRow.id)}`
            : `/api/employees/${encodeURIComponent(editRow.id)}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: val }),
        credentials: "same-origin",
      });
      const j = (await res.json()) as { ok?: boolean };
      if (j.ok) {
        setEditRow(null);
        await loadOverview();
        if (detail?.id === editRow.id && detail.type === editRow.entity_type) {
          await loadDetail();
        }
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const totalPages = overview ? Math.max(1, Math.ceil(overview.total / overview.pageSize)) : 1;

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-right font-semibold text-slate-900 shadow-sm outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  const renderEntityBadge = (t: EntityType) => {
    if (t === "customer") {
      return (
        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">
          לקוח
        </span>
      );
    }
    if (t === "supplier") {
      return (
        <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-800">
          ספק
        </span>
      );
    }
    return (
      <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-black text-cyan-900">
        עובד
      </span>
    );
  };

  const renderOpenBalanceCell = (row: LedgerOverviewRow) => {
    const v = Math.max(0, row.open_balance);
    if (v <= 0) {
      return <span className="font-black text-emerald-700">{formatShekel(0)}</span>;
    }
    return <span className="font-black text-rose-600">{formatShekel(v)}</span>;
  };

  return (
    <div className="mx-auto max-w-7xl app-panel p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold tracking-[0.12em] text-cyan-700">
            <BookMarked className="h-4 w-4" aria-hidden />
            כרטסות
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">כרטסת מאוחדת</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            כברירת מחדל מוצגים כל הלקוחות, הספקים והעובדים יחד. השתמשו בכפתור &quot;סינון&quot; להפעלת פילטרים.
          </p>
        </div>
      </div>

      {overview && (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
          <span className="font-bold text-slate-500">ישויות במערכת:</span>{" "}
          <span className="text-emerald-800">לקוחות {overview.counts.customers}</span>
          <span className="mx-2 text-slate-400">|</span>
          <span className="text-rose-800">ספקים {overview.counts.suppliers}</span>
          <span className="mx-2 text-slate-400">|</span>
          <span className="text-cyan-900">עובדים {overview.counts.employees}</span>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
          <Filter className="h-4 w-4 text-slate-500" aria-hidden />
          סינון (מוחל בלחיצה על &quot;סינון&quot;)
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="text-sm font-bold text-slate-800">
            חיפוש חופשי (שם)
            <input
              type="text"
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              className={inputClass}
              placeholder="הקלד לחיפוש…"
            />
          </label>

          <label className="text-sm font-bold text-slate-800">
            סוג ישות
            <select
              value={draft.entityType}
              onChange={(e) => {
                const v = e.target.value as EntityFilter;
                setDraft((d) => ({ ...d, entityType: v, entityId: "" }));
              }}
              className={inputClass}
            >
              <option value="all">הכל</option>
              <option value="customer">לקוח</option>
              <option value="supplier">ספק</option>
              <option value="employee">עובד</option>
            </select>
          </label>

          <label className="text-sm font-bold text-slate-800">
            שם / גורם
            <select
              value={draft.entityId}
              onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
              disabled={draft.entityType === "all"}
              className={`${inputClass} disabled:opacity-50`}
            >
              <option value="">{draft.entityType === "all" ? "בחרו סוג ישות לסינון לפי גורם" : "כל הגופים בסוג"}</option>
              {entityPicker.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-bold text-slate-800">
            מתאריך
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              className={inputClass}
            />
          </label>

          <label className="text-sm font-bold text-slate-800">
            עד תאריך
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              className={inputClass}
            />
          </label>

          <div className="flex flex-wrap items-end gap-2 pb-1">
            <button
              type="button"
              onClick={applyFilters}
              className="rounded-xl bg-luxury-gold px-5 py-3 text-sm font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover"
            >
              סינון
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              נקה פילטרים
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
        <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-right text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-bold text-slate-600">שם / גורם</th>
              <th className="px-4 py-3 font-bold text-slate-600">סוג ישות</th>
              <th className="px-4 py-3 font-bold text-slate-600">יתרה פתוחה</th>
              <th className="px-4 py-3 font-bold text-rose-700">חובה</th>
              <th className="px-4 py-3 font-bold text-emerald-700">זכות</th>
              <th className="px-4 py-3 font-bold text-slate-600">סה״כ תנועות</th>
              <th className="px-4 py-3 font-bold text-slate-600">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-semibold text-slate-500">
                  טוען…
                </td>
              </tr>
            )}
            {!loading &&
              overview?.rows.map((row) => (
                <tr key={`${row.entity_type}-${row.id}`}>
                  <td className="px-4 py-3 font-bold text-slate-950">{row.name}</td>
                  <td className="px-4 py-3">{renderEntityBadge(row.entity_type)}</td>
                  <td className="px-4 py-3">{renderOpenBalanceCell(row)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatShekel(row.total_debit)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatShekel(row.total_credit)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{row.movement_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        title="צפייה בכרטסת"
                        onClick={() => setDetailUrl({ type: row.entity_type, id: row.id })}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        title="עריכת יתרת פתיחה"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      {row.entity_type === "customer" ? (
                        <Link
                          title="קליטת תשלום"
                          href={`/finance/register?paymentCustomerId=${encodeURIComponent(row.id)}`}
                          className="rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-cyan-900 shadow-sm hover:bg-cyan-100"
                        >
                          <Wallet className="h-4 w-4" aria-hidden />
                        </Link>
                      ) : (
                        <span className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-slate-300" title="קליטת תשלום ללקוח בלבד">
                          <Wallet className="h-4 w-4" aria-hidden />
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && overview && overview.rows.length === 0 && (
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">אין תוצאות להצגה.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span>שורות בעמוד</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right font-bold"
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-bold hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
            הקודם
          </button>
          <span className="font-black text-slate-950">
            עמוד {page} מתוך {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-bold hover:bg-slate-50 disabled:opacity-40"
          >
            הבא
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {detail && (
        <div id="ledger-detail" className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-cyan-700">צפייה בכרטסת</p>
              <h2 className="text-xl font-black text-slate-950">{detailName || "…"}</h2>
              <p className="text-sm text-slate-600">
                סוג: {entityLabels[detail.type]} · טווח תאריכים לפי הפילטרים הפעילים
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetailUrl(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              סגירה
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
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
                {detailLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center font-semibold text-slate-500">
                      טוען תנועות…
                    </td>
                  </tr>
                )}
                {!detailLoading &&
                  rowsWithBalance.map((row, idx) => (
                    <tr key={`${row.id}-${idx}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.entry_date}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.doc_type}</td>
                      <td className="px-4 py-3 text-slate-600">{row.description}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{row.debit ? formatShekel(row.debit) : "—"}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{row.credit ? formatShekel(row.credit) : "—"}</td>
                      <td className="px-4 py-3 font-black text-slate-950">{formatShekel(row.balance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {!detailLoading && rowsWithBalance.length === 0 && (
            <p className="mt-4 text-center text-sm font-semibold text-slate-500">אין תנועות בטווח הנבחר.</p>
          )}
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-950">עריכת יתרת פתיחה</h3>
            <p className="mt-1 text-sm text-slate-600">
              {editRow.name} · {entityLabels[editRow.entity_type]}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              עדכון שדה יתרת פתיחה במערכת (נפרד מחוב מסמכים ללקוח).
            </p>
            <label className="mt-4 block text-sm font-bold text-slate-800">
              יתרת פתיחה
              <input
                type="number"
                step="0.01"
                value={editOpeningInput}
                onChange={(e) => setEditOpeningInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-right font-semibold"
              />
            </label>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => void saveEditOpening()}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
              >
                {savingEdit ? "שומר…" : "שמירה"}
              </button>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LedgersPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-7xl p-12 text-center text-sm font-semibold text-slate-500">טוען…</div>}
    >
      <LedgersPageInner />
    </Suspense>
  );
}
