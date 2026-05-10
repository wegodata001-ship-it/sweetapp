"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import type { PermissionKey } from "@/lib/auth/permissions";

type NavItem = {
  label: string;
  href: string;
  eyebrow: string;
  permission: PermissionKey | "SUPER_ADMIN_ONLY";
};

const financeNav: NavItem[] = [
  {
    label: "רישום כספי",
    href: "/finance/register",
    eyebrow: "כספים",
    permission: "financial_registration",
  },
  {
    label: "כרטסות",
    href: "/finance/ledgers",
    eyebrow: "כספים",
    permission: "ledger",
  },
  {
    label: "תזרים מזומנים",
    href: "/finance/cashflow",
    eyebrow: "כספים",
    permission: "cash_flow",
  },
  {
    label: "ארכיון מסמכים",
    href: "/finance/archive",
    eyebrow: "כספים",
    permission: "financial_registration",
  },
];

const managementNav: NavItem[] = [
  {
    label: "משימות לעובדים",
    href: "/admin/tasks",
    eyebrow: "ניהול",
    permission: "tasks",
  },
  {
    label: "טפסים",
    href: "/admin/forms",
    eyebrow: "טפסים",
    permission: "tasks",
  },
  {
    label: "ספירת מלאי",
    href: "/ops/inventory",
    eyebrow: "תפעול",
    permission: "inventory",
  },
];

const adminOnlyNav: NavItem[] = [
  {
    label: "ניהול משתמשים",
    href: "/admin/users",
    eyebrow: "ניהול",
    permission: "SUPER_ADMIN_ONLY",
  },
];

function canShowNavItem(
  item: NavItem,
  role: "SUPER_ADMIN" | "EMPLOYEE",
  permissions: Set<string>,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (item.permission === "SUPER_ADMIN_ONLY") return false;
  return permissions.has(item.permission);
}

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
  const { user, loading } = useAuth();
  const permSet = user ? new Set(user.permissions) : new Set<string>();
  const role = user?.role ?? "EMPLOYEE";

  const financeVisible = financeNav.filter((i) => canShowNavItem(i, role, permSet));
  const managementVisible = managementNav.filter((i) => canShowNavItem(i, role, permSet));
  const adminVisible = adminOnlyNav.filter((i) => canShowNavItem(i, role, permSet));

  const showWorkerPortal = role === "SUPER_ADMIN" || permSet.has("employee_clock");

  const anyNav =
    financeVisible.length > 0 || managementVisible.length > 0 || adminVisible.length > 0;

  if (loading) {
    return (
      <aside className="sticky top-0 hidden h-screen min-h-0 w-72 shrink-0 flex-col border-l border-white/10 bg-luxury-navy-rich shadow-luxury lg:flex">
        <div className="shrink-0 px-5 pt-6">
          <Link href="/" className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-luxury-gold text-base font-black text-luxury-charcoal shadow-luxury-sm">
              W
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black tracking-[0.12em] text-white">WEGO BUSINESS</p>
              <p className="font-arabic-brand mt-1 text-xl font-bold leading-snug text-luxury-gold">
                حلويات القدس
              </p>
            </div>
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-6 pt-4">
          <p className="text-sm font-semibold text-slate-400">טוען ניווט…</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-screen min-h-0 w-72 shrink-0 flex-col border-l border-white/10 bg-luxury-navy-rich shadow-luxury lg:flex">
      <div className="shrink-0 px-5 pt-6">
        <Link href="/" className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-luxury-gold text-base font-black text-luxury-charcoal shadow-luxury-sm">
            W
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-[0.12em] text-white">WEGO BUSINESS</p>
            <p className="font-arabic-brand mt-1 text-xl font-bold leading-snug text-luxury-gold">
              حلويات القدس
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">מערכת ניהול ERP</p>
          </div>
        </Link>

        <div className="mt-8 rounded-xl border border-white/10 bg-luxury-charcoal/40 p-4 shadow-luxury-sm backdrop-blur-sm">
          <p className="text-xs font-semibold tracking-[0.12em] text-slate-500">סביבת עבודה</p>
          <p className="mt-2 text-sm font-semibold text-white">מרכז בקרה פיננסי ותפעולי</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            ניווט לפי הרשאות — רואים רק מודולים שאושרו למשתמש.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-6 [-webkit-overflow-scrolling:touch]">
        {!anyNav ? (
          <p className="mt-2 rounded-xl border border-white/10 bg-luxury-charcoal/30 p-4 text-sm leading-relaxed text-slate-400">
            אין לך הרשאות גישה למודולים. פנה למנהל המערכת.
          </p>
        ) : (
          <nav className="space-y-6 pt-2">
            {financeVisible.length > 0 ? (
              <div>
                <div className="mb-3 px-2">
                  <p className="text-xs font-bold tracking-[0.12em] text-slate-500">פורטל כספים</p>
                </div>
                <div className="space-y-1">
                  {financeVisible.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {managementVisible.length > 0 || adminVisible.length > 0 ? (
              <div>
                <div className="mb-3 px-2">
                  <p className="text-xs font-bold tracking-[0.12em] text-slate-500">
                    פורטל ניהול ותפעול
                  </p>
                </div>
                <div className="space-y-1">
                  {managementVisible.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                  {adminVisible.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </div>
              </div>
            ) : null}
          </nav>
        )}

        {showWorkerPortal ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-luxury-charcoal/50 p-4 shadow-luxury-sm">
            <p className="text-xs font-semibold text-slate-300">גישה נפרדת לעובדים</p>
            <Link
              href="/worker/tasks"
              className="mt-3 inline-block w-full rounded-xl bg-luxury-gold px-4 py-2.5 text-center text-sm font-bold text-luxury-charcoal shadow-luxury-sm transition hover:bg-luxury-gold-hover"
            >
              מעבר לפורטל עובד אישי
            </Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
