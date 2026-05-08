import Link from "next/link";
import {
  dashboardStats,
  financialTransactions,
  originDocuments,
} from "@/lib/mock-data";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const stats = [
  {
    label: "Income",
    value: currencyFormatter.format(dashboardStats.income),
    detail: "Invoice and Z-report inflows",
  },
  {
    label: "Expenses",
    value: currencyFormatter.format(dashboardStats.expenses),
    detail: "Posted operational outflows",
  },
  {
    label: "Net Cashflow",
    value: currencyFormatter.format(dashboardStats.cashflow),
    detail: "Current mock cash movement",
  },
  {
    label: "Open Invoices",
    value: dashboardStats.openInvoices.toString(),
    detail: `${dashboardStats.overdueInvoices} overdue documents`,
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-xl shadow-slate-200">
        <div className="grid gap-8 p-8 lg:grid-cols-[1.4fr_0.6fr] lg:p-10">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">
              Enterprise ERP Dashboard
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
              WEGO ERP V1.0 finance and operations command center.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
              Initial App Router boilerplate for a two-portal ERP experience with
              strict source-linked financial transactions and a shared sidebar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/finance/income"
                className="rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
              >
                Create income document
              </Link>
              <Link
                href="/ops"
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
              >
                View operations portal
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
              Data Architecture
            </p>
            <p className="mt-4 text-2xl font-black">
              Polymorphic source model
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Cashflow and ledger rows carry both Source_Type and Source_ID so
              every transaction resolves back to the originating document.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              {stat.value}
            </p>
            <p className="mt-2 text-sm text-slate-500">{stat.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
                Financial Ledger
              </p>
              <h2 className="mt-2 text-2xl font-black text-slate-950">
                Source-bound transactions
              </h2>
            </div>
            <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-700">
              Mock JSON
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Account</th>
                  <th className="px-4 py-3 font-bold">Direction</th>
                  <th className="px-4 py-3 font-bold">Amount</th>
                  <th className="px-4 py-3 font-bold">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {financialTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-4 py-4 font-semibold text-slate-900">
                      {transaction.ledgerAccount}
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        {transaction.memo}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          transaction.direction === "INFLOW"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {transaction.direction}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-950">
                      {currencyFormatter.format(transaction.amount)}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-slate-600">
                      {transaction.Source_Type} / {transaction.Source_ID}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-400">
            Origin Documents
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">
            Document registry
          </h2>
          <div className="mt-6 space-y-3">
            {originDocuments.map((document) => (
              <div
                key={document.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-slate-950">
                    {document.documentNumber}
                  </p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                    {document.sourceType}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {document.counterparty}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  Source_ID: {document.id}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
