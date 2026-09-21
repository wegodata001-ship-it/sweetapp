"use client";

import { ChevronLeft, ChevronRight, Library, Printer, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { LiveRefreshStatus } from "@/components/live-refresh-status";
import { useLiveRefresh } from "@/hooks/use-live-refresh";
import { fetchLedgerV2Customer, fetchLedgerV2Overview } from "@/lib/finance/db";
import type { LedgerV2CustomerRow, LedgerV2Detail, LedgerV2MovementView, LedgerV2SideFilter, LedgerV2Totals } from "@/lib/finance/ledger-v2";
import { displaySide } from "@/lib/finance/ledger-v2";
import { formatShekel } from "@/lib/format-shekel";
import { translatePaymentMethod } from "@/lib/i18n/status-keys";
import type { TranslateFn } from "@/lib/i18n/translator";

type Filters = {
  q: string;
  side: LedgerV2SideFilter;
  dateFrom: string;
  dateTo: string;
};

function emptyFilters(): Filters {
  return { q: "", side: "all", dateFrom: "", dateTo: "" };
}

function formatDay(value: string | null, locale: string): string {
  if (!value) return "—";
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale);
}

function sideLabel(t: TranslateFn, signed: number, debt?: number, credit?: number) {
  const shown = displaySide(signed);
  if (shown.side === "CREDIT") {
    return (
      <span className="font-black text-emerald-700">
        {t("ledgerV2.credit", { amount: formatShekel(credit ?? shown.amount) })}
      </span>
    );
  }
  if (shown.side === "ZERO") {
    return <span className="font-black text-slate-700">{t("ledgerV2.zero")}</span>;
  }
  return (
    <span className="font-black text-amber-800">
      {t("ledgerV2.debt", { amount: formatShekel(debt ?? shown.amount) })}
    </span>
  );
}

function movementTypeLabel(t: TranslateFn, type: string): string {
  return t(`ledgerV2.types.${type}` as "ledgerV2.types.INVOICE");
}

function openPrintView(params: {
  t: TranslateFn;
  dir: "rtl" | "ltr";
  locale: string;
  detail: LedgerV2Detail;
  dateFrom: string;
  dateTo: string;
}) {
  const { t, dir, locale, detail, dateFrom, dateTo } = params;
  const range =
    dateFrom || dateTo
      ? `${dateFrom || "…"} — ${dateTo || "…"}`
      : t("ledgerV2.printAllDates");
  const rows = detail.movements
    .map((row) => {
      const after = displaySide(row.balanceAfter);
      const afterText =
        after.side === "ZERO"
          ? t("ledgerV2.zero")
          : after.side === "CREDIT"
            ? t("ledgerV2.credit", { amount: formatShekel(after.amount) })
            : t("ledgerV2.debt", { amount: formatShekel(after.amount) });
      return `<tr>
        <td>${row.date ? formatDay(row.date, locale) : "—"}</td>
        <td>${movementTypeLabel(t, row.type)}</td>
        <td>${row.reference ?? "—"}</td>
        <td>${row.description}</td>
        <td>${row.debit ? formatShekel(row.debit) : "—"}</td>
        <td>${row.credit ? formatShekel(row.credit) : "—"}</td>
        <td>${afterText}</td>
      </tr>`;
    })
    .join("");
  const html = `<!DOCTYPE html><html dir="${dir}" lang="${locale}"><head><meta charset="utf-8">
<title>${detail.customer.name}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: "Noto Sans Hebrew", Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .meta { font-size: 13px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: ${dir === "rtl" ? "right" : "left"}; }
  th { background: #f8fafc; }
  .totals { margin-top: 14px; font-size: 13px; }
</style></head><body>
  <h1>${t("ledgerV2.title")} — ${detail.customer.name}</h1>
  <div class="meta">
    <div>${t("ledgerV2.printBusiness")}: ${t("meta.appTitle")}</div>
    <div>${t("ledgerV2.printCustomer")}: ${detail.customer.name}${detail.phone ? ` · ${detail.phone}` : ""}</div>
    <div>${t("ledgerV2.printRange")}: ${range}</div>
    <div>${t("ledgerV2.periodOpening")}: ${formatShekel(detail.periodOpening)}</div>
    <div>${t("ledgerV2.currentBalance")}: ${
      displaySide(detail.signedBalance).side === "CREDIT"
        ? t("ledgerV2.credit", { amount: formatShekel(detail.credit) })
        : displaySide(detail.signedBalance).side === "ZERO"
          ? t("ledgerV2.zero")
          : t("ledgerV2.debt", { amount: formatShekel(detail.debt) })
    }</div>
  </div>
  <table>
    <thead><tr>
      <th>${t("ledgerV2.thDate")}</th>
      <th>${t("ledgerV2.thType")}</th>
      <th>${t("ledgerV2.thRef")}</th>
      <th>${t("ledgerV2.thDesc")}</th>
      <th>${t("ledgerV2.thDebit")}</th>
      <th>${t("ledgerV2.thCreditCol")}</th>
      <th>${t("ledgerV2.thBalanceAfter")}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div>${t("ledgerV2.kpiCharges")}: ${formatShekel(detail.charges)}</div>
    <div>${t("ledgerV2.kpiPayments")}: ${formatShekel(detail.payments)}</div>
    <div>${t("ledgerV2.thCreditNotes")}: ${formatShekel(detail.creditNotes)}</div>
  </div>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function LedgerV2Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, dir, bcp47 } = useI18n();

  const [draft, setDraft] = useState<Filters>(() => emptyFilters());
  const [applied, setApplied] = useState<Filters>(() => emptyFilters());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<LedgerV2CustomerRow[]>([]);
  const [totals, setTotals] = useState<LedgerV2Totals | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LedgerV2Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<LedgerV2MovementView | null>(null);
  const overviewRef = useRef(totals);

  useEffect(() => {
    overviewRef.current = totals;
  }, [totals]);

  useEffect(() => {
    const id = searchParams.get("customer")?.trim() || null;
    queueMicrotask(() => setDetailId(id));
  }, [searchParams]);

  const loadOverview = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent) && overviewRef.current !== null;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetchLedgerV2Overview({
          q: applied.q || undefined,
          side: applied.side,
          dateFrom: applied.dateFrom || null,
          dateTo: applied.dateTo || null,
          page,
          pageSize,
        });
        setRows(res.rows);
        setTotals(res.totals);
        setTotal(res.total);
        setError(null);
      } catch {
        if (!overviewRef.current) setError(t("ledgerV2.loadFailed"));
        throw new Error("ledger v2 refresh failed");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [applied, page, pageSize, t],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void loadOverview().catch(() => undefined);
    });
  }, [loadOverview]);

  const loadDetail = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!detailId) {
        setDetail(null);
        setSelectedMovement(null);
        return;
      }
      if (!opts?.silent) setDetailLoading(true);
      try {
        const next = await fetchLedgerV2Customer({
          id: detailId,
          dateFrom: applied.dateFrom || null,
          dateTo: applied.dateTo || null,
        });
        setDetail(next);
      } catch {
        setDetail(null);
      } finally {
        if (!opts?.silent) setDetailLoading(false);
      }
    },
    [detailId, applied.dateFrom, applied.dateTo],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void loadDetail().catch(() => undefined);
    });
  }, [loadDetail]);

  const { status: liveStatus } = useLiveRefresh({
    refresh: async () => {
      await loadOverview({ silent: true });
      await loadDetail({ silent: true });
    },
    scope: "finance",
  });

  const openDetail = (id: string) => {
    router.replace(`/finance/ledger-v2?customer=${encodeURIComponent(id)}`, { scroll: false });
  };
  const closeDetail = () => {
    setSelectedMovement(null);
    router.replace("/finance/ledger-v2", { scroll: false });
  };

  const applyFilters = () => {
    setApplied({ ...draft });
    setPage(1);
  };
  const clearFilters = () => {
    const next = emptyFilters();
    setDraft(next);
    setApplied(next);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sideButtons: { id: LedgerV2SideFilter; label: string }[] = useMemo(
    () => [
      { id: "all", label: t("ledgerV2.filterAll") },
      { id: "DEBT", label: t("ledgerV2.filterDebt") },
      { id: "CREDIT", label: t("ledgerV2.filterCredit") },
      { id: "ZERO", label: t("ledgerV2.filterZero") },
    ],
    [t],
  );

  const inputClass =
    "mt-1 block h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-[13px] font-semibold text-slate-900 shadow-sm outline-none focus:border-luxury-gold focus:ring-2 focus:ring-luxury-gold/25";

  return (
    <div className="mx-auto max-w-7xl app-panel p-4 md:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-cyan-700">
            <Library className="h-4 w-4" aria-hidden />
            {t("ledgerV2.kicker")}
          </p>
          <h1 className="mt-1 text-[32px] font-black leading-tight text-slate-950">{t("ledgerV2.title")}</h1>
          <p className="mt-1 max-w-2xl text-xs text-slate-600">{t("ledgerV2.subtitle")}</p>
        </div>
        <LiveRefreshStatus status={liveStatus} />
      </div>

      {totals && (
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: t("ledgerV2.kpiDebt"), value: formatShekel(totals.totalDebt), color: "text-amber-800" },
            { label: t("ledgerV2.kpiCredit"), value: formatShekel(totals.totalCredit), color: "text-emerald-700" },
            { label: t("ledgerV2.kpiPayments"), value: formatShekel(totals.totalPayments), color: "text-slate-900" },
            { label: t("ledgerV2.kpiCharges"), value: formatShekel(totals.totalCharges), color: "text-slate-900" },
            { label: t("ledgerV2.kpiDebtors"), value: String(totals.customersWithDebt), color: "text-amber-800" },
            { label: t("ledgerV2.kpiCreditors"), value: String(totals.customersWithCredit), color: "text-emerald-700" },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm">
              <p className="text-[11px] font-bold text-slate-500">{card.label}</p>
              <p className={`mt-1 text-lg font-black ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:grid-cols-12">
        <label className="md:col-span-4 text-xs font-bold text-slate-600">
          {t("common.search")}
          <input
            className={inputClass}
            value={draft.q}
            onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
            placeholder={t("ledgerV2.searchPlaceholder")}
          />
        </label>
        <label className="md:col-span-2 text-xs font-bold text-slate-600">
          {t("common.dateFrom")}
          <input
            type="date"
            className={inputClass}
            value={draft.dateFrom}
            onChange={(e) => setDraft((prev) => ({ ...prev, dateFrom: e.target.value }))}
          />
        </label>
        <label className="md:col-span-2 text-xs font-bold text-slate-600">
          {t("common.dateTo")}
          <input
            type="date"
            className={inputClass}
            value={draft.dateTo}
            onChange={(e) => setDraft((prev) => ({ ...prev, dateTo: e.target.value }))}
          />
        </label>
        <div className="md:col-span-4 flex flex-wrap items-end gap-2">
          {sideButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, side: btn.id }))}
              className={`h-[42px] rounded-lg border px-3 text-xs font-black ${
                draft.side === btn.id
                  ? "border-cyan-700 bg-cyan-50 text-cyan-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="md:col-span-12 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="h-9 rounded-lg bg-luxury-navy-rich px-4 text-xs font-black text-white"
          >
            {t("ledgerV2.apply")}
          </button>
          <button type="button" onClick={clearFilters} className="h-9 rounded-lg border border-slate-300 px-4 text-xs font-bold">
            {t("ledgerV2.clear")}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}

      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-100 md:block">
        <table className="w-full min-w-[1100px] table-fixed divide-y divide-slate-200 text-right text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              {[
                t("ledgerV2.thName"),
                t("ledgerV2.thPhone"),
                t("ledgerV2.thOpening"),
                t("ledgerV2.thCharges"),
                t("ledgerV2.thPayments"),
                t("ledgerV2.thCreditNotes"),
                t("ledgerV2.thDebt"),
                t("ledgerV2.thCredit"),
                t("ledgerV2.thCurrent"),
                t("ledgerV2.thLast"),
                t("ledgerV2.thActions"),
              ].map((h) => (
                <th key={h} className="px-3 py-2 text-[12px] font-bold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                  {t("common.loading")}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-black text-slate-950">{row.name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    <div>{row.phone || "—"}</div>
                    <div className="text-[11px] text-slate-400">{row.id}</div>
                  </td>
                  <td className="px-3 py-2">{formatShekel(row.openingBalance)}</td>
                  <td className="px-3 py-2">{formatShekel(row.charges)}</td>
                  <td className="px-3 py-2">{formatShekel(row.payments)}</td>
                  <td className="px-3 py-2">{formatShekel(row.creditNotes)}</td>
                  <td className="px-3 py-2">{formatShekel(row.debt)}</td>
                  <td className="px-3 py-2">{formatShekel(row.credit)}</td>
                  <td className="px-3 py-2">{sideLabel(t, row.signedBalance, row.debt, row.credit)}</td>
                  <td className="px-3 py-2">{formatDay(row.lastMovementDate, bcp47)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openDetail(row.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-cyan-900 hover:bg-cyan-50"
                    >
                      {t("ledgerV2.openLedger")}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 md:hidden">
        {loading && <p className="rounded-xl bg-white p-3 text-center text-sm text-slate-500">{t("common.loading")}</p>}
        {!loading &&
          rows.map((row) => (
            <article key={row.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-slate-950">{row.name}</h2>
                  <p className="text-[11px] text-slate-500">{row.phone || row.id}</p>
                </div>
                {sideLabel(t, row.signedBalance, row.debt, row.credit)}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {t("ledgerV2.lastPayment")}: {formatDay(row.lastMovementDate, bcp47)}
              </p>
              <button
                type="button"
                onClick={() => openDetail(row.id)}
                className="mt-2 h-9 w-full rounded-lg bg-cyan-50 text-xs font-black text-cyan-900"
              >
                {t("ledgerV2.openLedger")}
              </button>
            </article>
          ))}
      </div>

      {!loading && rows.length === 0 && (
        <p className="mt-6 text-center text-sm font-semibold text-slate-500">{t("ledgerV2.noResults")}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span>{t("common.rowsPerPage")}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-8 rounded-lg border border-slate-300 px-2 font-bold"
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
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2 font-bold disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
            {t("common.previous")}
          </button>
          <span className="font-black">
            {t("common.page")} {page} {t("common.of")} {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 px-2 font-bold disabled:opacity-40"
          >
            {t("common.next")}
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {detailId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl md:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-cyan-700">{t("ledgerV2.detailTitle")}</p>
                <h2 className="text-xl font-black text-slate-950">{detail?.customer.name ?? "…"}</h2>
                <p className="text-xs text-slate-600">{detail?.phone || detail?.customer.id}</p>
                {detail && <div className="mt-1">{sideLabel(t, detail.signedBalance, detail.debt, detail.credit)}</div>}
              </div>
              <div className="flex items-center gap-2">
                {detail && (
                  <button
                    type="button"
                    onClick={() =>
                      openPrintView({
                        t,
                        dir,
                        locale: bcp47,
                        detail,
                        dateFrom: applied.dateFrom,
                        dateTo: applied.dateTo,
                      })
                    }
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-black"
                  >
                    <Printer className="h-4 w-4" />
                    {t("ledgerV2.download")}
                  </button>
                )}
                <button type="button" onClick={closeDetail} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-4">
              {detailLoading && <p className="py-8 text-center text-sm text-slate-500">{t("common.loading")}</p>}
              {detail && (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    {[
                      [t("ledgerV2.kpiCharges"), formatShekel(detail.charges)],
                      [t("ledgerV2.kpiPayments"), formatShekel(detail.payments)],
                      [t("ledgerV2.thCreditNotes"), formatShekel(detail.creditNotes)],
                      [t("ledgerV2.thDebt"), formatShekel(detail.debt)],
                      [t("ledgerV2.thCredit"), formatShekel(detail.credit)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[11px] font-bold text-slate-500">{label}</p>
                        <p className="font-black">{value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <p className="font-black text-slate-800">{t("ledgerV2.currentBalance")}: {sideLabel(t, detail.signedBalance, detail.debt, detail.credit)}</p>
                    <p className="mt-1 text-slate-600">{t("ledgerV2.periodOpening")}: {formatShekel(detail.periodOpening)}</p>
                    <p className="text-slate-600">{t("ledgerV2.movementCount")}: {detail.movementCount}</p>
                    <p className="text-slate-600">{t("ledgerV2.lastMovement")}: {formatDay(detail.lastMovementDate, bcp47)}</p>
                    <p className="mt-2 text-slate-500">{t("ledgerV2.documentKpiNote")}</p>
                    <p className="text-slate-600">{t("ledgerV2.openInvoices")}: {detail.documentKpi.openInvoices}</p>
                    <p className="text-slate-600">{t("ledgerV2.paidInvoices")}: {detail.documentKpi.paidInvoices}</p>
                  </div>

                  <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-100 md:block">
                    <table className="w-full min-w-[900px] divide-y divide-slate-200 text-right text-[13px]">
                      <thead className="bg-slate-50">
                        <tr>
                          {[t("ledgerV2.thDate"), t("ledgerV2.thType"), t("ledgerV2.thRef"), t("ledgerV2.thDesc"), t("ledgerV2.thDebit"), t("ledgerV2.thCreditCol"), t("ledgerV2.thBalanceAfter")].map((h) => (
                            <th key={h} className="px-3 py-2 text-[12px] font-bold text-slate-600">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.movements.map((row) => (
                          <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedMovement(row)}>
                            <td className="px-3 py-2">{row.date ? formatDay(row.date, bcp47) : "—"}</td>
                            <td className="px-3 py-2 font-semibold">{movementTypeLabel(t, row.type)}</td>
                            <td className="px-3 py-2">
                              {row.documentHref ? (
                                <Link href={row.documentHref} className="font-bold text-cyan-800 underline" onClick={(e) => e.stopPropagation()}>
                                  {row.reference}
                                </Link>
                              ) : (
                                row.reference ?? "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{row.description}</td>
                            <td className="px-3 py-2">{row.debit ? formatShekel(row.debit) : "—"}</td>
                            <td className="px-3 py-2">{row.credit ? formatShekel(row.credit) : "—"}</td>
                            <td className="px-3 py-2">{sideLabel(t, row.balanceAfter)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 grid gap-2 md:hidden">
                    {detail.movements.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setSelectedMovement(row)}
                        className="rounded-xl border border-slate-100 bg-white p-3 text-right"
                      >
                        <p className="text-[11px] text-slate-500">{row.date ? formatDay(row.date, bcp47) : "—"} · {movementTypeLabel(t, row.type)}</p>
                        <p className="font-semibold text-slate-900">{row.description}</p>
                        <div className="mt-1 flex justify-between text-xs">
                          <span>{row.debit ? formatShekel(row.debit) : row.credit ? formatShekel(row.credit) : "—"}</span>
                          {sideLabel(t, row.balanceAfter)}
                        </div>
                      </button>
                    ))}
                  </div>

                  {detail.movements.length === 0 && (
                    <p className="mt-4 text-center text-sm text-slate-500">{t("ledgerV2.noMovements")}</p>
                  )}

                  {selectedMovement && (
                    <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/40 p-3 text-sm">
                      <p className="font-black text-cyan-900">{t("ledgerV2.movementDetails")}</p>
                      <p className="mt-1 text-xs text-slate-500">{t("ledgerV2.readOnly")}</p>
                      <p className="mt-2">{movementTypeLabel(t, selectedMovement.type)}</p>
                      <p>{selectedMovement.date ? formatDay(selectedMovement.date, bcp47) : "—"}</p>
                      <p>{formatShekel(selectedMovement.debit || selectedMovement.credit)}</p>
                      {selectedMovement.paymentMethod && (
                        <p>{t("ledgerV2.paymentMethod")}: {translatePaymentMethod(t, selectedMovement.paymentMethod)}</p>
                      )}
                      {selectedMovement.notes && <p>{t("ledgerV2.notes")}: {selectedMovement.notes}</p>}
                      {selectedMovement.paymentStatus && <p>{t("ledgerV2.status")}: {selectedMovement.paymentStatus}</p>}
                      {selectedMovement.documentHref && (
                        <Link href={selectedMovement.documentHref} className="font-bold text-cyan-800 underline">
                          {t("ledgerV2.linkedDocument")}
                        </Link>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LedgerV2Page() {
  return (
    <Suspense fallback={<LedgerV2Loading />}>
      <LedgerV2Inner />
    </Suspense>
  );
}

function LedgerV2Loading() {
  const { t } = useI18n();
  return <div className="mx-auto max-w-7xl p-12 text-center text-sm font-semibold text-slate-500">{t("common.loading")}</div>;
}
