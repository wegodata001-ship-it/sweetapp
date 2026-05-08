import Link from "next/link";
import { dashboardStats, incomeDocuments } from "@/lib/mock-data";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function FinancePortalPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-600">
          Finance Portal
        </p>
        <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-950">
              Income, expenses, and cashflow oversight.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              The finance workspace starts with source-linked documents and
              ledger entries so every cash movement can be traced to an invoice,
              Z-report, purchase order, or approved adjustment.
            </p>
          </div>
          <Link
            href="/finance/income"
            className="rounded-full bg-slate-950 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800"
          >
            New income document
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-500">Total income</p>
          <p className="mt-3 text-3xl font-black">
            {currencyFormatter.format(dashboardStats.income)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-500">Total expenses</p>
          <p className="mt-3 text-3xl font-black">
            {currencyFormatter.format(dashboardStats.expenses)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-500">Cashflow</p>
          <p className="mt-3 text-3xl font-black">
            {currencyFormatter.format(dashboardStats.cashflow)}
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
              Income Documents
            </p>
            <h2 className="mt-2 text-2xl font-black">Recent invoices</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            {incomeDocuments.length} active
          </span>
        </div>

        <div className="mt-6 grid gap-3">
          {incomeDocuments.map((document) => (
            <div
              key={document.id}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">
                    {document.documentNumber}
                  </p>
                  <p className="text-sm text-slate-500">{document.counterparty}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    Source_Type: {document.sourceType}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    Source_ID: {document.id}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
