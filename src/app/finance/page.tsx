"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { FinanceDocumentRow } from "@/lib/finance/types";

type Stats = {
  income: number;
  expenses: number;
  cashflow: number;
  openInvoices: number;
  openDeposits: number;
  overdueInvoices: number;
  openBalancesTotal: number;
};

export default function FinancePortalPage() {
  const { t, bcp47 } = useI18n();
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(bcp47, {
        style: "currency",
        currency: "ILS",
        maximumFractionDigits: 0,
      }),
    [bcp47],
  );
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<FinanceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setStats(null);
    setRecent([]);
    try {
      const [sRes, dRes] = await Promise.all([
        fetch("/api/finance/stats", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/documents", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const sj = (await sRes.json()) as { ok?: boolean; data?: Stats };
      if (sj.ok && sj.data) setStats(sj.data);
      if (dRes.ok) {
        const dj = (await dRes.json()) as { ok?: boolean; data?: FinanceDocumentRow[] };
        const list = dj.data ?? [];
        setRecent(
          list
            .filter((r) => r.category === "הכנסה")
            .slice(0, 12),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const income = stats?.income ?? 0;
  const expenses = stats?.expenses ?? 0;
  const cashflow = stats?.cashflow ?? 0;
  const openDeposits = stats?.openDeposits ?? 0;
  const openBalancesTotal = stats?.openBalancesTotal ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="app-panel p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-600">
          {t("financePortal.kicker")}
        </p>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              {t("financePortal.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {t("financePortal.subtitle")}
            </p>
          </div>
          <Link
            href="/finance/income"
            className="rounded-full bg-luxury-gold px-5 py-3 text-center text-sm font-bold text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover"
          >
            {t("financePortal.newIncomeDoc")}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="app-panel p-6">
          <p className="text-sm font-semibold text-slate-500">{t("financePortal.totalIncome")}</p>
          <p className="mt-3 text-3xl font-black">
            {loading ? "…" : currencyFormatter.format(income)}
          </p>
        </div>
        <div className="app-panel p-6">
          <p className="text-sm font-semibold text-slate-500">{t("financePortal.totalExpenses")}</p>
          <p className="mt-3 text-3xl font-black">
            {loading ? "…" : currencyFormatter.format(expenses)}
          </p>
        </div>
        <div className="app-panel p-6">
          <p className="text-sm font-semibold text-slate-500">{t("financePortal.cashflow")}</p>
          <p className="mt-3 text-3xl font-black">
            {loading ? "…" : currencyFormatter.format(cashflow)}
          </p>
        </div>
        <div className="app-panel border-orange-200 bg-orange-50/60 p-6">
          <p className="text-sm font-semibold text-orange-950">{t("financePortal.openBalances")}</p>
          <p className="mt-3 text-3xl font-black text-orange-950">
            {loading ? "…" : currencyFormatter.format(openBalancesTotal)}
          </p>
        </div>
        <div className="app-panel border-amber-200 bg-amber-50/50 p-6">
          <p className="text-sm font-semibold text-amber-900">{t("financePortal.openDeposits")}</p>
          <p className="mt-3 text-3xl font-black text-amber-950">
            {loading ? "…" : currencyFormatter.format(openDeposits)}
          </p>
        </div>
      </section>

      <section className="app-panel p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              {t("financePortal.incomeDocs")}
            </p>
            <h2 className="mt-2 text-2xl font-black">{t("financePortal.recentInvoices")}</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            {t("financePortal.activeN", { count: recent.length })}
          </span>
        </div>

        <div className="mt-6 grid gap-3">
          {recent.map((document) => (
            <div
              key={document.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">{document.title}</p>
                  <p className="text-sm text-slate-500">{document.category}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    {t("common.date")}: {document.doc_date ?? "—"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    ID: {document.id}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {!loading && recent.length === 0 && (
            <p className="text-sm font-semibold text-slate-500">{t("financePortal.noIncomeDocs")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
