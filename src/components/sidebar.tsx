"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  eyebrow: string;
};

const financeNav: NavItem[] = [
  { label: "Income", href: "/finance/income", eyebrow: "FIN" },
  { label: "Expenses", href: "/finance/expenses", eyebrow: "FIN" },
  { label: "Cashflow", href: "/finance/cashflow", eyebrow: "FIN" },
];

const operationsNav: NavItem[] = [
  { label: "Kanban Tasks", href: "/ops/kanban", eyebrow: "OPS" },
  { label: "Inventory", href: "/ops/inventory", eyebrow: "OPS" },
  { label: "Time Attendance", href: "/ops/attendance", eyebrow: "OPS" },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      <span
        className={`rounded-lg border px-2 py-1 text-[10px] font-bold tracking-widest ${
          active
            ? "border-white/20 bg-white/10 text-white"
            : "border-slate-200 bg-white text-slate-400 group-hover:text-slate-700"
        }`}
      >
        {item.eyebrow}
      </span>
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-slate-200 bg-white/90 px-5 py-6 backdrop-blur lg:block">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
          W
        </div>
        <div>
          <p className="text-sm font-black uppercase tracking-[0.24em] text-slate-950">
            WEGO
          </p>
          <p className="text-xs font-semibold text-slate-500">ERP V1.0</p>
        </div>
      </Link>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Workspace
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-900">
          Enterprise Command Center
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Unified finance and operations portals with source-linked ledger data.
        </p>
      </div>

      <nav className="mt-8 space-y-8">
        <div>
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Finance Portal
            </p>
            <Link href="/finance" className="text-xs font-semibold text-slate-500">
              View
            </Link>
          </div>
          <div className="space-y-1">
            {financeNav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
              Operations Portal
            </p>
            <Link href="/ops" className="text-xs font-semibold text-slate-500">
              View
            </Link>
          </div>
          <div className="space-y-1">
            {operationsNav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>
      </nav>
    </aside>
  );
}
