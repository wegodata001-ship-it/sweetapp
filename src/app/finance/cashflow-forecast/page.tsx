"use client";

import {
  AlertTriangle,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  Landmark,
  LineChart,
  Loader2,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  ForecastRowActionsMenu,
  type ForecastRowAction,
} from "@/components/finance/forecast-row-actions-menu";
import type {
  CashflowForecastKpis,
  CashflowForecastRow,
  CashflowShortage,
} from "@/lib/finance/cashflow-forecast/types";
import { formatShekel, parseNum } from "@/lib/format-shekel";

type ModalKind = "defer" | "edit_amount" | "change_date" | "manual_entry" | null;
type ManualEntryType = "expected_income" | "loan";

function formatDisplayDate(iso: string, bcp47: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(bcp47);
}

function defaultRange(): { from: string; to: string } {
  const from = new Date();
  const y = from.getFullYear();
  const m = String(from.getMonth() + 1).padStart(2, "0");
  const d = String(from.getDate()).padStart(2, "0");
  const to = new Date(from);
  to.setDate(to.getDate() + 90);
  const ty = to.getFullYear();
  const tm = String(to.getMonth() + 1).padStart(2, "0");
  const td = String(to.getDate()).padStart(2, "0");
  return { from: `${y}-${m}-${d}`, to: `${ty}-${tm}-${td}` };
}

function rowClassName(alertLevel: CashflowForecastRow["alertLevel"]): string {
  if (alertLevel === "critical") return "bg-red-50 text-red-800";
  if (alertLevel === "warning") return "bg-amber-50 text-amber-900";
  return "border-b border-slate-50 text-slate-800";
}

function shortageReactKey(s: CashflowShortage): string {
  return s.id || `${s.date}-${s.shortageAmount}-${s.balance}`;
}

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function CashflowForecastPage() {
  const { t, bcp47 } = useI18n();
  const initialRange = useMemo(() => defaultRange(), []);
  const balanceSectionRef = useRef<HTMLElement>(null);

  const [loading, setLoading] = useState(true);
  const [savingBalance, setSavingBalance] = useState(false);
  const [bankBalance, setBankBalance] = useState(0);
  const [balanceInput, setBalanceInput] = useState("");
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [rows, setRows] = useState<CashflowForecastRow[]>([]);
  const [shortages, setShortages] = useState<CashflowShortage[]>([]);
  const [kpis, setKpis] = useState<CashflowForecastKpis | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterShortageOnly, setFilterShortageOnly] = useState(false);
  const [filterIncomeOnly, setFilterIncomeOnly] = useState(false);
  const [filterExpensesOnly, setFilterExpensesOnly] = useState(false);

  const [actionRow, setActionRow] = useState<CashflowForecastRow | null>(null);
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [modalValue, setModalValue] = useState("");
  const [manualEntryType, setManualEntryType] = useState<ManualEntryType>("expected_income");
  const [manualDueDate, setManualDueDate] = useState(initialRange.from);
  const [actionBusy, setActionBusy] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [quickSolutionOpen, setQuickSolutionOpen] = useState(false);

  const shortageDates = useMemo(
    () => new Set(shortages.map((s) => s.date)),
    [shortages],
  );

  const hasNegativeForecast = (kpis?.closingBalance ?? 0) < 0 || shortages.length > 0;

  const filteredRows = useMemo(() => {
    let list = rows;
    if (filterShortageOnly) {
      list = list.filter((r) => r.isOpening || shortageDates.has(r.date));
    }
    if (filterIncomeOnly) {
      list = list.filter((r) => r.isOpening || (r.inflow ?? 0) > 0);
    }
    if (filterExpensesOnly) {
      list = list.filter((r) => r.isOpening || (r.outflow ?? 0) > 0);
    }
    return list;
  }, [rows, filterShortageOnly, filterIncomeOnly, filterExpensesOnly, shortageDates]);

  const firstDeferrableOutflow = useMemo(
    () => rows.find((r) => !r.isOpening && (r.outflow ?? 0) > 0 && r.sourceId),
    [rows],
  );

  const loadForecast = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      const res = await fetch(`/api/cashflow-forecast?${params}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        success?: boolean;
        ok?: boolean;
        bankBalance?: number;
        rows?: CashflowForecastRow[];
        shortages?: CashflowShortage[];
        kpis?: CashflowForecastKpis;
      };
      if (!res.ok || j.success === false || j.ok === false) {
        setLoadError(t("cashflowForecast.loadError"));
        setRows([]);
        setShortages([]);
        setKpis(null);
        return;
      }
      setBankBalance(j.bankBalance ?? 0);
      setBalanceInput(String(j.bankBalance ?? 0));
      setRows(j.rows ?? []);
      setShortages(j.shortages ?? []);
      setKpis(j.kpis ?? null);
    } catch {
      setLoadError(t("cashflowForecast.loadError"));
      setRows([]);
      setShortages([]);
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, t]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadForecast();
    });
  }, [loadForecast]);

  const closeModal = () => {
    setActionRow(null);
    setModalKind(null);
    setModalValue("");
  };

  const postForecastAction = async (
    action: string,
    row: CashflowForecastRow,
    extra?: { newDueDate?: string; newAmount?: number; amount?: number },
  ) => {
    if (!row.sourceId || !row.sourceType || row.isOpening) return false;
    setActionBusy(true);
    setBusyRowId(row.id);
    setNotice(null);
    try {
      const res = await fetch("/api/cashflow-forecast/action", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          paymentLineId: row.paymentLineId,
          ...extra,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; success?: boolean; message?: string };
      if (!res.ok || j.ok === false || j.success === false) {
        setNotice(j.message ?? t("cashflowForecast.actionError"));
        return false;
      }
      setNotice(t("cashflowForecast.actionSuccess"));
      closeModal();
      await loadForecast();
      return true;
    } catch {
      setNotice(t("cashflowForecast.actionError"));
      return false;
    } finally {
      setActionBusy(false);
      setBusyRowId(null);
    }
  };

  const handleRowAction = (action: ForecastRowAction, row: CashflowForecastRow) => {
    if (action === "open_source" && row.sourceHref) {
      window.location.href = row.sourceHref;
      return;
    }
    if (action === "defer") {
      setActionRow(row);
      setModalKind("defer");
      setModalValue(row.date);
      return;
    }
    if (action === "edit_amount") {
      setActionRow(row);
      setModalKind("edit_amount");
      setModalValue(String(row.outflow ?? row.inflow ?? ""));
      return;
    }
    if (action === "change_date") {
      setActionRow(row);
      setModalKind("change_date");
      setModalValue(row.date);
      return;
    }
    if (action === "mark_received") {
      void postForecastAction("mark_received", row, { amount: row.inflow ?? 0 });
    }
  };

  const confirmModal = async () => {
    if (!actionRow) return;
    if (modalKind === "defer") {
      await postForecastAction("defer", actionRow, { newDueDate: modalValue });
      return;
    }
    if (modalKind === "change_date") {
      await postForecastAction("change_date", actionRow, { newDueDate: modalValue });
      return;
    }
    if (modalKind === "edit_amount") {
      await postForecastAction("edit_amount", actionRow, { newAmount: parseNum(modalValue) });
      return;
    }
    if (modalKind === "manual_entry") {
      setActionBusy(true);
      setNotice(null);
      try {
        const res = await fetch("/api/cashflow-forecast/manual-entry", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryType: manualEntryType,
            amount: parseNum(modalValue),
            dueDate: manualDueDate || dateFrom,
            description:
              manualEntryType === "loan"
                ? t("cashflowForecast.manualLoanDefault")
                : t("cashflowForecast.manualIncomeDefault"),
          }),
        });
        const j = (await res.json()) as { ok?: boolean; success?: boolean; message?: string };
        if (!res.ok || j.ok === false || j.success === false) {
          setNotice(j.message ?? t("cashflowForecast.actionError"));
          return;
        }
        setNotice(t("cashflowForecast.manualEntrySuccess"));
        closeModal();
        setQuickSolutionOpen(false);
        await loadForecast();
      } catch {
        setNotice(t("cashflowForecast.actionError"));
      } finally {
        setActionBusy(false);
      }
    }
  };

  const saveBalance = async () => {
    setSavingBalance(true);
    setNotice(null);
    try {
      const val = parseNum(balanceInput);
      const res = await fetch("/api/cashflow-forecast/bank-balance", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forecastBankBalance: val }),
      });
      const j = (await res.json()) as {
        success?: boolean;
        ok?: boolean;
        message?: string;
        forecastBankBalance?: number;
      };
      if (!res.ok || j.success === false || j.ok === false) {
        setNotice(j.message ?? t("cashflowForecast.bankBalanceError"));
        return;
      }
      setBankBalance(j.forecastBankBalance ?? val);
      setBalanceInput(String(j.forecastBankBalance ?? val));
      setNotice(t("cashflowForecast.bankBalanceSaved"));
      setQuickSolutionOpen(false);
      await loadForecast();
    } catch {
      setNotice(t("cashflowForecast.bankBalanceError"));
    } finally {
      setSavingBalance(false);
    }
  };

  const exportCsv = () => {
    const header = [
      t("cashflowForecast.colDate"),
      t("cashflowForecast.colDescription"),
      t("cashflowForecast.colInflow"),
      t("cashflowForecast.colOutflow"),
      t("cashflowForecast.colBalance"),
    ];
    const lines = filteredRows.map((row) => {
      const desc =
        row.isOpening && row.description === "יתרת פתיחה"
          ? t("cashflowForecast.openingBalance")
          : row.description;
      return [
        formatDisplayDate(row.date, bcp47),
        desc,
        row.inflow != null ? String(row.inflow) : "",
        row.outflow != null ? String(row.outflow) : "",
        String(row.expectedBalance),
      ]
        .map(escapeCsvCell)
        .join(",");
    });
    const bom = "\uFEFF";
    const blob = new Blob([bom + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cashflow-forecast-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPrint = () => {
    window.print();
  };

  const openManualEntry = (type: ManualEntryType) => {
    setManualEntryType(type);
    setManualDueDate(dateFrom);
    setActionRow({ id: "manual", date: dateFrom } as CashflowForecastRow);
    setModalKind("manual_entry");
    setModalValue("");
    setQuickSolutionOpen(false);
  };

  const scrollToBalance = () => {
    setQuickSolutionOpen(false);
    balanceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const openQuickDefer = () => {
    if (!firstDeferrableOutflow) return;
    setQuickSolutionOpen(false);
    setActionRow(firstDeferrableOutflow);
    setModalKind("defer");
    setModalValue(firstDeferrableOutflow.date);
  };

  return (
    <div className="mx-auto max-w-7xl app-panel mb-[14px] p-4 md:p-[18px] print:p-2">
      <header className="mb-6 print:mb-3">
        <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-indigo-700 opacity-80">
          <LineChart className="h-4 w-4" aria-hidden />
          {t("cashflowForecast.kicker")}
        </p>
        <h1 className="erp-page-title mt-1.5 text-slate-950">{t("cashflowForecast.title")}</h1>
        <p className="mt-1 max-w-3xl text-[14px] leading-snug text-slate-600 opacity-80">
          {t("cashflowForecast.subtitle")}
        </p>
      </header>

      {loadError ? (
        <p
          className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 ring-1 ring-red-100"
          role="alert"
        >
          {loadError}
        </p>
      ) : null}

      {notice ? (
        <p className="mb-4 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 ring-1 ring-indigo-100">
          {notice}
        </p>
      ) : null}

      <section
        ref={balanceSectionRef}
        className="mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-slate-50 p-5 shadow-sm print:hidden"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-indigo-800">
              <Landmark className="h-4 w-4" aria-hidden />
              {t("cashflowForecast.bankBalanceTitle")}
            </p>
            <p className="mt-1 max-w-xl text-xs text-slate-600">{t("cashflowForecast.bankBalanceHint")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="sr-only">{t("cashflowForecast.bankBalanceTitle")}</span>
              <input
                type="number"
                step="0.01"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-black text-slate-900 shadow-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveBalance()}
              disabled={savingBalance}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingBalance ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("cashflowForecast.bankBalanceSave")}
            </button>
          </div>
        </div>
        <p className="mt-3 text-2xl font-black text-slate-900">{formatShekel(bankBalance)}</p>
      </section>

      <section className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <label className="block text-sm font-semibold text-slate-700">
          {t("cashflowForecast.dateFrom")}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          {t("cashflowForecast.dateTo")}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadForecast()}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden /> : null}
          {t("cashflowForecast.applyRange")}
        </button>

        <div className="ms-auto flex flex-wrap items-center gap-2 border-s border-slate-200 ps-3">
          <button
            type="button"
            onClick={exportPrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            PDF
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
            Excel
          </button>
        </div>
      </section>

      <section className="mb-4 flex flex-wrap gap-2 print:hidden">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={filterShortageOnly}
            onChange={(e) => setFilterShortageOnly(e.target.checked)}
            className="accent-indigo-600"
          />
          {t("cashflowForecast.filterShortageOnly")}
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={filterIncomeOnly}
            onChange={(e) => setFilterIncomeOnly(e.target.checked)}
            className="accent-indigo-600"
          />
          {t("cashflowForecast.filterIncomeOnly")}
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={filterExpensesOnly}
            onChange={(e) => setFilterExpensesOnly(e.target.checked)}
            className="accent-indigo-600"
          />
          {t("cashflowForecast.filterExpensesOnly")}
        </label>
      </section>

      {kpis ? (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t("cashflowForecast.kpiOpening"), value: kpis.openingBalance },
            { label: t("cashflowForecast.kpiInflows"), value: kpis.totalInflows, tone: "text-green-700" },
            { label: t("cashflowForecast.kpiOutflows"), value: kpis.totalOutflows, tone: "text-red-700" },
            { label: t("cashflowForecast.kpiClosing"), value: kpis.closingBalance, bold: true },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-semibold text-slate-500">{card.label}</p>
              <p className={`mt-1 text-xl font-black tabular-nums ${card.tone ?? "text-slate-900"}`}>
                {formatShekel(card.value)}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {shortages.length > 0 ? (
        <section
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 print:border-red-300"
          aria-label={t("cashflowForecast.shortageBanner")}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-bold text-red-800">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                {t("cashflowForecast.shortageBanner")}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {shortages.map((s) => (
                  <li key={shortageReactKey(s)}>
                    {t("cashflowForecast.shortageItem", {
                      date: formatDisplayDate(s.date, bcp47),
                      amount: formatShekel(s.shortageAmount),
                    })}
                  </li>
                ))}
              </ul>
            </div>
            {hasNegativeForecast ? (
              <button
                type="button"
                onClick={() => setQuickSolutionOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 print:hidden"
              >
                <Wand2 className="h-4 w-4" aria-hidden />
                {t("cashflowForecast.quickSolution")}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("cashflowForecast.loading")}
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">{t("cashflowForecast.noRows")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 text-start">{t("cashflowForecast.colDate")}</th>
                  <th className="px-4 py-3 text-start">{t("cashflowForecast.colDescription")}</th>
                  <th className="px-4 py-3 text-end">{t("cashflowForecast.colInflow")}</th>
                  <th className="px-4 py-3 text-end">{t("cashflowForecast.colOutflow")}</th>
                  <th className="px-4 py-3 text-end">{t("cashflowForecast.colBalance")}</th>
                  <th className="px-4 py-3 text-end print:hidden">{t("cashflowForecast.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const desc =
                    row.isOpening && row.description === "יתרת פתיחה"
                      ? t("cashflowForecast.openingBalance")
                      : row.description;
                  const showWarningIcon = row.alertLevel !== "none";
                  const canOpenSource =
                    Boolean(row.sourceHref) && row.sourceType !== "manual_income" && !row.isOpening;

                  return (
                    <tr key={row.id} className={rowClassName(row.alertLevel)}>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {formatDisplayDate(row.date, bcp47)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span>{desc}</span>
                          {canOpenSource ? (
                            <Link
                              href={row.sourceHref!}
                              className="inline-flex w-fit items-center gap-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 print:hidden"
                            >
                              {t("cashflowForecast.actionOpenSource")}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {row.inflow != null ? formatShekel(row.inflow) : t("cashflowForecast.emptyDash")}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">
                        {row.outflow != null ? formatShekel(row.outflow) : t("cashflowForecast.emptyDash")}
                      </td>
                      <td className="px-4 py-3 text-end font-bold tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {showWarningIcon ? (
                            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                          ) : null}
                          {formatShekel(row.expectedBalance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end print:hidden">
                        {!row.isOpening ? (
                          <ForecastRowActionsMenu
                            row={row}
                            busy={busyRowId === row.id}
                            onAction={handleRowAction}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalKind && actionRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-black text-slate-900">
              {modalKind === "defer"
                ? t("cashflowForecast.deferTitle")
                : modalKind === "edit_amount"
                  ? t("cashflowForecast.editAmountTitle")
                  : modalKind === "change_date"
                    ? t("cashflowForecast.changeDateTitle")
                    : manualEntryType === "loan"
                      ? t("cashflowForecast.addLoanTitle")
                      : t("cashflowForecast.addIncomeTitle")}
            </h2>
            {actionRow.description && modalKind !== "manual_entry" ? (
              <p className="mt-1 text-sm text-slate-600">{actionRow.description}</p>
            ) : null}
            <label className="mt-4 block text-sm font-semibold text-slate-700">
              {modalKind === "edit_amount"
                ? t("cashflowForecast.editAmountLabel")
                : modalKind === "manual_entry"
                  ? t("cashflowForecast.manualAmountLabel")
                  : t("cashflowForecast.deferNewDate")}
              <input
                type={modalKind === "edit_amount" || modalKind === "manual_entry" ? "number" : "date"}
                step={modalKind === "edit_amount" || modalKind === "manual_entry" ? "0.01" : undefined}
                value={modalValue}
                onChange={(e) => setModalValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            {modalKind === "manual_entry" ? (
              <label className="mt-3 block text-sm font-semibold text-slate-700">
                {t("cashflowForecast.deferNewDate")}
                <input
                  type="date"
                  value={manualDueDate}
                  onChange={(e) => setManualDueDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t("cashflowForecast.deferCancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmModal()}
                disabled={actionBusy || !modalValue}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t("cashflowForecast.deferConfirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {quickSolutionOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-solution-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 id="quick-solution-title" className="text-lg font-black text-slate-900">
              {t("cashflowForecast.quickSolutionTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t("cashflowForecast.quickSolutionHint")}</p>
            <ul className="mt-4 space-y-2">
              {[
                {
                  key: "defer",
                  label: t("cashflowForecast.deferPayment"),
                  icon: CalendarClock,
                  onClick: openQuickDefer,
                  disabled: !firstDeferrableOutflow,
                },
                {
                  key: "income",
                  label: t("cashflowForecast.addExpectedIncome"),
                  icon: LineChart,
                  onClick: () => openManualEntry("expected_income"),
                },
                {
                  key: "loan",
                  label: t("cashflowForecast.addLoan"),
                  icon: BanknoteIcon,
                  onClick: () => openManualEntry("loan"),
                },
                {
                  key: "balance",
                  label: t("cashflowForecast.increaseOpeningBalance"),
                  icon: Landmark,
                  onClick: scrollToBalance,
                },
                {
                  key: "export",
                  label: t("cashflowForecast.exportData"),
                  icon: FileSpreadsheet,
                  onClick: () => {
                    exportCsv();
                    setQuickSolutionOpen(false);
                  },
                },
              ].map(({ key, label, icon: Icon, onClick, disabled }) => (
                <li key={key}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onClick}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-start text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setQuickSolutionOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                {t("cashflowForecast.deferCancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BanknoteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M6 10h.01M18 14h.01" />
    </svg>
  );
}
