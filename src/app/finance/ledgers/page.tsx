"use client";

import { BookMarked, ChevronLeft, ChevronRight, Eye, Filter, Pencil, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  fetchEntitiesByType,
  fetchLedgerForFilters,
  fetchLedgerOverview,
  type LedgerOverviewResponse,
} from "@/lib/finance/db";
import type { EntityType, FinanceEntityRow, LedgerMovementView, LedgerOverviewRow } from "@/lib/finance/types";
import { formatShekel } from "@/lib/format-shekel";
import { translateDocCategory } from "@/lib/i18n/status-keys";
import type { TranslateFn } from "@/lib/i18n/translator";
import { withLedgerRunningBalances } from "@/lib/running-calcs";

function entityLabel(t: TranslateFn, type: EntityType): string {
  if (type === "customer") return t("entities.customer");
  if (type === "supplier") return t("entities.supplier");
  return t("entities.employee");
}

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
  const { t } = useI18n();

  const [draft, setDraft] = useState<Filters>(() => emptyFilters());
  const [applied, setApplied] = useState<Filters>(() => emptyFilters());

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

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
    setOverview(null);
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
      setError(t("ledgers.loadFailed"));
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [applied, page, pageSize, t]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadOverview();
    });
  }, [loadOverview]);

  const loadDetail = useCallback(async () => {
    if (!detail) {
      setDetailOpening(0);
      setDetailMovements([]);
      setDetailName("");
      return;
    }
    setDetailLoading(true);
    setDetailOpening(0);
    setDetailMovements([]);
    setDetailName("");
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
  const pageSummary = useMemo(() => {
    const rows = overview?.rows ?? [];
    return rows.reduce(
      (acc, row) => ({
        debit: acc.debit + row.total_debit,
        credit: acc.credit + row.total_credit,
        open: acc.open + Math.max(0, row.open_balance),
      }),
      { debit: 0, credit: 0, open: 0 },
    );
  }, [overview]);

  const inputClass =
    "mt-1 block h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-[13px] font-semibold text-slate-900 shadow-sm outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";
  const thClass = "px-3 py-2 text-[14px] font-bold";
  const tdClass = "h-[52px] px-3 py-2 align-middle text-[13px]";
  const iconButtonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-luxury-navy-rich";

  const renderEntityBadge = (type: EntityType) => {
    if (type === "customer") {
      return (
        <span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-black text-emerald-800">
          {t("entities.customer")}
        </span>
      );
    }
    if (type === "supplier") {
      return (
        <span className="inline-flex h-7 items-center rounded-full border border-rose-200 bg-rose-50 px-2 text-[11px] font-black text-rose-800">
          {t("entities.supplier")}
        </span>
      );
    }
    return (
      <span className="inline-flex h-7 items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 text-[11px] font-black text-cyan-900">
        {t("entities.employee")}
      </span>
    );
  };

  const renderOpenBalanceCell = (row: LedgerOverviewRow) => {
    const v = Math.max(0, row.open_balance);
    if (v <= 0) {
      return <span className="font-black text-emerald-700">{formatShekel(0)}</span>;
    }
    return <span className="font-black text-amber-800">{formatShekel(v)}</span>;
  };

  return (
    <div className="mx-auto max-w-7xl app-panel p-4 md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-cyan-700">
            <BookMarked className="h-4 w-4" aria-hidden />
            {t("ledgers.kicker")}
          </p>
          <h1 className="mt-1 text-[32px] font-black leading-tight text-slate-950">{t("ledgers.title")}</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-600">{t("ledgers.subtitle")}</p>
        </div>
      </div>

      {overview && (
        <div className="mt-3 flex h-auto min-h-11 flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm md:h-11">
          <span className="font-bold text-slate-500">{t("ledgers.entitiesInSystem")}</span>{" "}
          <span className="text-emerald-800">{t("ledgers.customersN", { count: overview.counts.customers })}</span>
          <span className="text-slate-400">|</span>
          <span className="text-rose-800">{t("ledgers.suppliersN", { count: overview.counts.suppliers })}</span>
          <span className="text-slate-400">|</span>
          <span className="text-cyan-900">{t("ledgers.employeesN", { count: overview.counts.employees })}</span>
          <span className="ms-auto hidden text-slate-400 md:inline">|</span>
          <span className="text-rose-700">{t("ledgers.totalDebit", { amount: formatShekel(pageSummary.debit) })}</span>
          <span className="text-emerald-700">{t("ledgers.totalCredit", { amount: formatShekel(pageSummary.credit) })}</span>
          <span className="text-slate-950">{t("ledgers.totalOpen", { amount: formatShekel(pageSummary.open) })}</span>
        </div>
      )}

      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 shadow-sm">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-800">
          <Filter className="h-4 w-4 text-slate-500" aria-hidden />
          {t("ledgers.filterApplyHint")}
        </p>
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs font-bold text-slate-800">
            {t("ledgers.searchByName")}
            <input
              type="text"
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              className={inputClass}
              placeholder={t("common.searchPlaceholder")}
            />
          </label>

          <label className="text-xs font-bold text-slate-800">
            {t("ledgers.entityType")}
            <select
              value={draft.entityType}
              onChange={(e) => {
                const v = e.target.value as EntityFilter;
                setDraft((d) => ({ ...d, entityType: v, entityId: "" }));
              }}
              className={inputClass}
            >
              <option value="all">{t("common.all")}</option>
              <option value="customer">{t("entities.customer")}</option>
              <option value="supplier">{t("entities.supplier")}</option>
              <option value="employee">{t("entities.employee")}</option>
            </select>
          </label>

          <label className="text-xs font-bold text-slate-800">
            {t("ledgers.entityName")}
            <select
              value={draft.entityId}
              onChange={(e) => setDraft((d) => ({ ...d, entityId: e.target.value }))}
              disabled={draft.entityType === "all"}
              className={`${inputClass} disabled:opacity-50`}
            >
              <option value="">{draft.entityType === "all" ? t("ledgers.entityPickPrompt") : t("ledgers.allInType")}</option>
              {entityPicker.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold text-slate-800">
            {t("common.dateFrom")}
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              className={inputClass}
            />
          </label>

          <label className="text-xs font-bold text-slate-800">
            {t("common.dateTo")}
            <input
              type="date"
              value={draft.dateTo}
              onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
              className={inputClass}
            />
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="h-[42px] rounded-lg bg-luxury-gold px-4 text-xs font-black text-luxury-charcoal shadow-luxury-sm hover:bg-luxury-gold-hover"
            >
              {t("ledgers.applyFilter")}
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="h-[42px] rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              {t("ledgers.clearFilter")}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200 shadow-sm [scrollbar-width:thin] hover:[scrollbar-color:#cbd5e1_transparent] md:block [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
        <table className="w-full min-w-[880px] table-fixed divide-y divide-slate-200 text-right text-[13px]">
          <colgroup>
            <col className="w-[160px]" />
            <col className="w-[90px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[100px]" />
            <col className="w-[80px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
            <tr>
              <th className={`${thClass} text-slate-600`}>{t("ledgers.thName")}</th>
              <th className={`${thClass} text-slate-600`}>{t("ledgers.thType")}</th>
              <th className={`${thClass} text-slate-600`}>{t("ledgers.thOpen")}</th>
              <th className={`${thClass} text-rose-700`}>{t("ledgers.thDebit")}</th>
              <th className={`${thClass} text-emerald-700`}>{t("ledgers.thCredit")}</th>
              <th className={`${thClass} text-slate-600`}>{t("ledgers.thMovements")}</th>
              <th className={`${thClass} text-slate-600`}>{t("ledgers.thActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td colSpan={7} className="h-[52px] px-3 py-2 text-center text-[13px] font-semibold text-slate-500">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!loading &&
              overview?.rows.map((row) => (
                <tr key={`${row.entity_type}-${row.id}`} className="h-[52px] transition hover:bg-slate-50/80">
                  <td className={`${tdClass} truncate font-bold text-slate-950`} title={row.name}>{row.name}</td>
                  <td className={tdClass}>{renderEntityBadge(row.entity_type)}</td>
                  <td className={tdClass}>{renderOpenBalanceCell(row)}</td>
                  <td className={`${tdClass} font-semibold text-slate-900`}>{formatShekel(row.total_debit)}</td>
                  <td className={`${tdClass} font-semibold text-slate-900`}>{formatShekel(row.total_credit)}</td>
                  <td className={`${tdClass} font-semibold text-slate-700`}>{row.movement_count}</td>
                  <td className={tdClass}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title={t("ledgers.viewLedger")}
                        onClick={() => setDetailUrl({ type: row.entity_type, id: row.id })}
                        className={iconButtonClass}
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        title={t("ledgers.editOpening")}
                        onClick={() => openEdit(row)}
                        className={iconButtonClass}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      {row.entity_type === "customer" ? (
                        <Link
                          title={t("ledgers.registerPayment")}
                          href={`/finance/register?paymentCustomerId=${encodeURIComponent(row.id)}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-900 shadow-sm transition hover:bg-cyan-100"
                        >
                          <Wallet className="h-4 w-4" aria-hidden />
                        </Link>
                      ) : (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300" title={t("ledgers.paymentCustomerOnly")}>
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

      <div className="mt-3 grid gap-2 md:hidden">
        {loading && (
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-center text-[13px] font-semibold text-slate-500 shadow-sm">
            {t("common.loading")}
          </div>
        )}
        {!loading &&
          overview?.rows.map((row) => (
            <article key={`${row.entity_type}-${row.id}-mobile`} className="rounded-xl border border-slate-100 bg-white p-3 text-[13px] shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-slate-950">{row.name}</h2>
                  <div className="mt-1">{renderEntityBadge(row.entity_type)}</div>
                </div>
                <details className="relative">
                  <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700">
                    {t("common.actions")}
                  </summary>
                  <div className="absolute left-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => setDetailUrl({ type: row.entity_type, id: row.id })}
                      className="block w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {t("ledgers.viewLedger")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="block w-full rounded-lg px-3 py-2 text-right text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {t("ledgers.editOpening")}
                    </button>
                    {row.entity_type === "customer" && (
                      <Link
                        href={`/finance/register?paymentCustomerId=${encodeURIComponent(row.id)}`}
                        className="block rounded-lg px-3 py-2 text-right text-xs font-bold text-cyan-900 hover:bg-cyan-50"
                      >
                        {t("ledgers.registerPayment")}
                      </Link>
                    )}
                  </div>
                </details>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <p className="text-[11px] font-bold text-slate-500">{t("ledgers.thOpen")}</p>
                  <p className="font-black">{renderOpenBalanceCell(row)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                  <p className="text-[11px] font-bold text-slate-500">{t("ledgers.thMovements")}</p>
                  <p className="font-black text-slate-900">{row.movement_count}</p>
                </div>
                <div className="rounded-lg bg-rose-50 px-2 py-1.5">
                  <p className="text-[11px] font-bold text-rose-700">{t("ledgers.thDebit")}</p>
                  <p className="font-black text-slate-900">{formatShekel(row.total_debit)}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2 py-1.5">
                  <p className="text-[11px] font-bold text-emerald-700">{t("ledgers.thCredit")}</p>
                  <p className="font-black text-slate-900">{formatShekel(row.total_credit)}</p>
                </div>
              </div>
            </article>
          ))}
      </div>

      {!loading && overview && overview.rows.length === 0 && (
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">{t("ledgers.noResultsAll")}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("common.rowsPerPage")}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-right text-xs font-bold"
          >
            {[12, 25, 50].map((n) => (
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
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2 font-bold hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
            {t("common.previous")}
          </button>
          <span className="font-black text-slate-950">
            {t("common.page")} {page} {t("common.of")} {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2 font-bold hover:bg-slate-50 disabled:opacity-40"
          >
            {t("common.next")}
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {detail && (
        <div id="ledger-detail" className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-cyan-700">{t("ledgers.viewing")}</p>
              <h2 className="text-lg font-black text-slate-950">{detailName || "…"}</h2>
              <p className="text-xs text-slate-600">
                {t("ledgers.typeAndRange", { type: entityLabel(t, detail.type) })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetailUrl(null)}
              className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"
            >
              {t("common.close")}
            </button>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-100 [scrollbar-width:thin] hover:[scrollbar-color:#cbd5e1_transparent] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
            <table className="w-full min-w-[820px] table-fixed divide-y divide-slate-200 text-right text-[13px]">
              <colgroup>
                <col className="w-[110px]" />
                <col className="w-[120px]" />
                <col />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                <tr>
                  <th className={`${thClass} text-slate-600`}>{t("ledgers.thDate")}</th>
                  <th className={`${thClass} text-slate-600`}>{t("ledgers.thDocType")}</th>
                  <th className={`${thClass} text-slate-600`}>{t("ledgers.thDescription")}</th>
                  <th className={`${thClass} text-rose-700`}>{t("ledgers.thDebit")}</th>
                  <th className={`${thClass} text-emerald-700`}>{t("ledgers.thCredit")}</th>
                  <th className={`${thClass} text-slate-900`}>{t("ledgers.thBalance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {detailLoading && (
                  <tr>
                    <td colSpan={6} className="h-[52px] px-3 py-2 text-center text-[13px] font-semibold text-slate-500">
                      {t("ledgers.loadingMovements")}
                    </td>
                  </tr>
                )}
                {!detailLoading &&
                  rowsWithBalance.map((row, idx) => (
                    <tr key={`${row.id}-${idx}`} className="h-[52px] transition hover:bg-slate-50/80">
                      <td className={`${tdClass} whitespace-nowrap text-slate-700`}>{row.entry_date}</td>
                      <td className={`${tdClass} font-semibold text-slate-900`}>{translateDocCategory(t, row.doc_type)}</td>
                      <td className={`${tdClass} truncate text-slate-600`} title={row.description}>{row.description}</td>
                      <td className={`${tdClass} font-bold text-slate-900`}>{row.debit ? formatShekel(row.debit) : "—"}</td>
                      <td className={`${tdClass} font-bold text-slate-900`}>{row.credit ? formatShekel(row.credit) : "—"}</td>
                      <td
                        className={`${tdClass} font-black ${
                          row.balance > 1e-6 ? "text-amber-900" : "text-slate-950"
                        }`}
                      >
                        {formatShekel(row.balance)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {!detailLoading && rowsWithBalance.length === 0 && (
            <p className="mt-4 text-center text-sm font-semibold text-slate-500">{t("ledgers.noMovements")}</p>
          )}
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-black text-slate-950">{t("ledgers.editOpening")}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {editRow.name} · {entityLabel(t, editRow.entity_type)}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t("ledgers.openingHelp")}
            </p>
            <label className="mt-4 block text-sm font-bold text-slate-800">
              {t("ledgers.openingBalance")}
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
                {savingEdit ? t("common.saving") : t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setEditRow(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel")}
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
      fallback={<LedgersLoadingFallback />}
    >
      <LedgersPageInner />
    </Suspense>
  );
}

function LedgersLoadingFallback() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-7xl p-12 text-center text-sm font-semibold text-slate-500">
      {t("common.loading")}
    </div>
  );
}
