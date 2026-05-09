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
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-luxury-gold text-luxury-charcoal shadow-luxury-sm"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span
        className={`rounded-lg border px-2 py-1 text-[10px] font-bold tracking-widest ${
          active
            ? "border-luxury-charcoal/25 bg-luxury-charcoal/10 text-luxury-charcoal"
            : "border-white/15 bg-white/5 text-slate-400 group-hover:text-slate-200"
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
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-l border-white/10 bg-luxury-navy-rich px-5 py-6 shadow-luxury lg:block">
      <Link href="/" className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-luxury-gold text-base font-black text-luxury-charcoal shadow-luxury-sm">
          W
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black tracking-[0.12em] text-white">
            WEGO BUSINESS
          </p>
          <p className="font-arabic-brand mt-1 text-xl font-bold leading-snug text-luxury-gold">
            حلويات القدس
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            מערכת ניהול ERP
          </p>
        </div>
      </Link>

      <div className="mt-8 rounded-xl border border-white/10 bg-luxury-charcoal/40 p-4 shadow-luxury-sm backdrop-blur-sm">
        <p className="text-xs font-semibold tracking-[0.12em] text-slate-500">
          סביבת עבודה
        </p>
        <p className="mt-2 text-sm font-semibold text-white">
          מרכז בקרה פיננסי ותפעולי
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          ניווט אדמין ממוקד לרישום כספי, תזרים, משימות, מלאי וארכיון.
        </p>
      </div>

      <nav className="mt-8 space-y-6">
        <div>
          <div className="mb-3 px-2">
            <p className="text-xs font-bold tracking-[0.12em] text-slate-500">
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
            <p className="text-xs font-bold tracking-[0.12em] text-slate-500">
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

      <div className="mt-8 rounded-xl border border-white/10 bg-luxury-charcoal/50 p-4 shadow-luxury-sm">
        <p className="text-xs font-semibold text-slate-300">
          גישה נפרדת לעובדים
        </p>
        <Link
          href="/worker"
          className="mt-3 inline-block w-full rounded-xl bg-luxury-gold px-4 py-2.5 text-center text-sm font-bold text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover"
        >
          מעבר לפורטל עובד אישי
        </Link>
      </div>
    </aside>
  );
}
