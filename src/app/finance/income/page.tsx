"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FinanceDocumentRow } from "@/lib/finance/types";

export default function IncomeDocumentPage() {
  const [docs, setDocs] = useState<FinanceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents", { credentials: "same-origin" });
      const j = (await res.json()) as { data?: FinanceDocumentRow[] };
      const list = j.data ?? [];
      setDocs(list.filter((r) => r.category === "הכנסה"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sampleInvoice = docs[0];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="app-panel p-8">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-600">
          Finance / Income
        </p>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              Create Income Document
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Boilerplate invoice capture form. On save, the invoice document
              becomes the origin record for any future cashflow or ledger rows.
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
                Invoice number
              </span>
              <input
                name="documentNumber"
                defaultValue="INV-2026-1009"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                Source ID
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
                Customer / counterparty
              </span>
              <input
                name="counterparty"
                placeholder="Customer legal name"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">
                Issue date
              </span>
              <input
                type="date"
                name="issuedAt"
                defaultValue="2026-05-08"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">Due date</span>
              <input
                type="date"
                name="dueAt"
                defaultValue="2026-06-07"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                Line item description
              </span>
              <input
                name="description"
                placeholder="Implementation services, subscription, goods sold..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-luxury-gold focus:bg-white focus:ring-4 focus:ring-luxury-gold/15"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">Quantity</span>
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
                Unit price
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
              Source linkage invariant
            </p>
            <p className="mt-2 text-sm leading-6 text-cyan-800">
              Any ledger or cashflow transaction generated from this document
              must persist Source_Type=&quot;INVOICE&quot; and Source_ID matching
              the invoice origin record.
            </p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/finance/register"
              className="rounded-full border border-slate-200 px-5 py-3 text-center text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              רישום מלא במערכת
            </Link>
            <button
              type="button"
              className="rounded-full bg-luxury-gold px-5 py-3 text-sm font-bold text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover"
            >
              Create invoice
            </button>
          </div>
        </form>

        <aside className="space-y-6">
          <div className="app-panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              Database records
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-luxury-charcoal p-4 text-xs leading-6 text-luxury-gold/90">
              {loading ? "טוען…" : `${docs.length} income rows`}
            </pre>
          </div>

          <div className="app-panel p-6">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              Existing Example
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
                <p className="text-sm text-slate-500">אין עדיין מסמכי הכנסה במסד.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
