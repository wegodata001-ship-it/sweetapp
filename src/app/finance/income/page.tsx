"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { FinanceDocumentRow } from "@/lib/finance/types";

export default function IncomeDocumentPage() {
  const { t } = useI18n();
  const [docs, setDocs] = useState<FinanceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setDocs([]);
    try {
      const res = await fetch("/api/documents", { credentials: "same-origin", cache: "no-store" });
      const j = (await res.json()) as { data?: FinanceDocumentRow[] };
      const list = j.data ?? [];
      setDocs(list.filter((r) => r.category === "הכנסה"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const sampleInvoice = docs[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="app-panel p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-600">
          {t("incomePage.kicker")}
        </p>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              {t("incomePage.title")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {t("incomePage.subtitle")}
            </p>
          </div>
          <span className="w-fit rounded-full bg-luxury-gold px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-luxury-charcoal">
            Source_Type: INVOICE
          </span>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <form className="app-panel p-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                {t("incomePage.invoiceNumber")}
              </span>
              <input
                name="documentNumber"
                defaultValue="INV-2026-1009"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                {t("incomePage.sourceId")}
              </span>
              <input
                name="sourceId"
                defaultValue="inv_1009"
                readOnly
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-mono text-sm text-slate-500 outline-none"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                {t("incomePage.counterparty")}
              </span>
              <input
                name="counterparty"
                placeholder={t("incomePage.counterpartyPlaceholder")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                {t("incomePage.issueDate")}
              </span>
              <input
                type="date"
                name="issuedAt"
                defaultValue="2026-05-08"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">{t("incomePage.dueDate")}</span>
              <input
                type="date"
                name="dueAt"
                defaultValue="2026-06-07"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                {t("incomePage.lineDescription")}
              </span>
              <input
                name="description"
                placeholder={t("incomePage.lineDescriptionPlaceholder")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">{t("incomePage.quantity")}</span>
              <input
                type="number"
                name="quantity"
                min="1"
                defaultValue="1"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                {t("incomePage.unitPrice")}
              </span>
              <input
                type="number"
                name="unitPrice"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>
          </div>

          <input type="hidden" name="sourceType" value="INVOICE" />

          <div className="mt-6 rounded-3xl border border-cyan-100 bg-cyan-50 p-4">
            <p className="text-sm font-bold text-cyan-900">
              {t("incomePage.linkageTitle")}
            </p>
            <p className="mt-2 text-sm leading-6 text-cyan-800">
              {t("incomePage.linkageDescription")}
            </p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/finance/register"
              className="rounded-full border border-slate-200 px-5 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              {t("incomePage.fullRegister")}
            </Link>
            <button
              type="button"
              className="rounded-full bg-luxury-gold px-5 py-3 text-sm font-bold text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover"
            >
              {t("incomePage.createInvoice")}
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <div className="app-panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              {t("incomePage.dbRecords")}
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-luxury-charcoal p-4 text-xs leading-6 text-luxury-gold/90">
              {loading ? t("common.loading") : t("incomePage.incomeRowsN", { count: docs.length })}
            </pre>
          </div>

          <div className="app-panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              {t("incomePage.existingExample")}
            </p>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              {sampleInvoice ? (
                <>
                  <p className="font-bold text-slate-950">{sampleInvoice.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{sampleInvoice.category}</p>
                  <p className="mt-3 font-mono text-xs text-slate-500">
                    Source_ID: {sampleInvoice.id}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500">{t("incomePage.noIncomeDocsYet")}</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
