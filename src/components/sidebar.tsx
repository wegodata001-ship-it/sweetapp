"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  eyebrow: string;
};

const financeNav: NavItem[] = [
  { label: "רישום כספי", href: "/finance/register", eyebrow: "כספים" },
  { label: "כרטסות", href: "/finance/ledgers", eyebrow: "כספים" },
  { label: "תזרים מזומנים", href: "/finance/cashflow", eyebrow: "כספים" },
  { label: "ארכיון מסמכים", href: "/finance/archive", eyebrow: "כספים" },
];

const managementNav: NavItem[] = [
  { label: "ניהול משימות וטפסים", href: "/admin/tasks", eyebrow: "ניהול" },
  { label: "ספירת מלאי", href: "/ops/inventory", eyebrow: "תפעול" },
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
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-l border-slate-200 bg-white/90 px-5 py-6 backdrop-blur lg:block">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
          W
        </div>
        <div>
          <p className="text-sm font-black tracking-[0.06em] text-slate-950">
            WEGO
          </p>
          <p className="text-xs font-semibold text-slate-500">מערכת ניהול ERP</p>
        </div>
      </Link>

      <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold tracking-[0.12em] text-slate-400">
          סביבת עבודה
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-900">
          מרכז בקרה פיננסי ותפעולי
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          ניווט אדמין ממוקד לרישום כספי, תזרים, משימות, מלאי וארכיון.
        </p>
      </div>

      <nav className="mt-8 space-y-6">
        <div>
          <div className="mb-3 px-2">
            <p className="text-xs font-bold tracking-[0.12em] text-slate-400">
              פורטל כספים
            </p>
          </div>
          <div className="space-y-1">
            {financeNav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 px-2">
            <p className="text-xs font-bold tracking-[0.12em] text-slate-400">
              פורטל ניהול ותפעול
            </p>
          </div>
          <div className="space-y-1">
            {managementNav.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>
      </nav>

      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold text-emerald-700">גישה נפרדת לעובדים</p>
        <Link
          href="/worker"
          className="mt-2 inline-block rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          מעבר לפורטל עובד אישי
        </Link>
      </div>
    </aside>
  );
}
