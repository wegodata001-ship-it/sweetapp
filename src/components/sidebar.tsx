"use client";

import {
  Archive,
  BookMarked,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  PackageCheck,
  ReceiptText,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import type { PermissionKey } from "@/lib/auth/permissions";

type NavItem = {
  label: string;
  href: string;
  eyebrow: string;
  permission: PermissionKey | "SUPER_ADMIN_ONLY";
  icon: LucideIcon;
};

const financeNav: NavItem[] = [
  {
    label: "רישום כספי",
    href: "/finance/register",
    eyebrow: "כספים",
    permission: "financial_registration",
    icon: ReceiptText,
  },
  {
    label: "כרטסות",
    href: "/finance/ledgers",
    eyebrow: "כספים",
    permission: "ledger",
    icon: BookMarked,
  },
  {
    label: "תזרים מזומנים",
    href: "/finance/cashflow",
    eyebrow: "כספים",
    permission: "cash_flow",
    icon: TrendingUp,
  },
  {
    label: "ארכיון מסמכים",
    href: "/finance/archive",
    eyebrow: "כספים",
    permission: "financial_registration",
    icon: Archive,
  },
];

const managementNav: NavItem[] = [
  {
    label: "משימות לעובדים",
    href: "/admin/tasks",
    eyebrow: "ניהול",
    permission: "tasks",
    icon: ClipboardList,
  },
  {
    label: "טפסים",
    href: "/admin/forms",
    eyebrow: "טפסים",
    permission: "tasks",
    icon: LayoutGrid,
  },
  {
    label: "ספירת מלאי",
    href: "/ops/inventory",
    eyebrow: "תפעול",
    permission: "inventory",
    icon: PackageCheck,
  },
];

const adminOnlyNav: NavItem[] = [
  {
    label: "ניהול משתמשים",
    href: "/admin/users",
    eyebrow: "ניהול",
    permission: "SUPER_ADMIN_ONLY",
    icon: Users,
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
  const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={item.label}
      className={`group/sidebar-item relative flex min-h-[54px] items-center justify-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold transition duration-300 ease-out lg:justify-start lg:px-3 ${
        active
          ? "border-r-[3px] border-[#d4af37] bg-[linear-gradient(90deg,rgba(212,175,55,.18),transparent)] text-white shadow-[0_0_20px_rgba(212,175,55,0.15)]"
          : "text-slate-300 hover:translate-x-[-3px] hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span
        className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border transition duration-300 ease-out group-hover/sidebar-item:scale-[1.08] ${
          active
            ? "border-[#d4af37]/40 bg-[linear-gradient(135deg,#d4af37,#f3d36a)] text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.22)]"
            : "border-white/10 bg-white/[0.04] text-slate-400 group-hover/sidebar-item:border-[#d4af37]/45 group-hover/sidebar-item:text-[#d4af37] group-hover/sidebar-item:shadow-[0_0_20px_rgba(212,175,55,0.15)]"
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="hidden min-w-0 lg:block">
        <span className="block truncate">{item.label}</span>
      </span>
      <span className="pointer-events-none absolute right-[70px] z-50 hidden whitespace-nowrap rounded-xl border border-white/10 bg-[#0d1a30] px-3 py-2 text-xs font-bold text-white opacity-0 shadow-xl transition group-hover/sidebar-item:flex group-hover/sidebar-item:opacity-100 lg:hidden">
        {item.label}
      </span>
    </Link>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 hidden px-2 lg:block">
      <p className="text-[12px] font-black tracking-[0.05em] text-slate-400/55">{children}</p>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const permSet = user ? new Set(user.permissions) : new Set<string>();
  const role = user?.role ?? "EMPLOYEE";

  const financeVisible = financeNav.filter((i) => canShowNavItem(i, role, permSet));
  const managementVisible = managementNav.filter((i) => canShowNavItem(i, role, permSet));
  const adminVisible = adminOnlyNav.filter((i) => canShowNavItem(i, role, permSet));

  const showMyTasksNav =
    role === "SUPER_ADMIN" ||
    role === "EMPLOYEE" ||
    permSet.has("employee_clock") ||
    permSet.has("tasks");

  const anyNav = true;

  if (loading) {
    return (
      <aside className="sticky top-0 flex h-screen min-h-0 w-[78px] shrink-0 flex-col border-l border-white/10 bg-[#081224] shadow-luxury lg:w-72">
        <div className="shrink-0 px-3 pt-5 lg:px-5 lg:pt-6">
          <Link href="/" className="flex items-center justify-center gap-3 lg:justify-start">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d4af37] text-base font-black text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.15)]">
              W
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="text-sm font-black tracking-[0.12em] text-white">WEGO BUSINESS</p>
              <p className="font-arabic-brand mt-1 text-xl font-bold leading-snug text-luxury-gold">
                حلويات القدس
              </p>
            </div>
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-6 pt-5 lg:px-5">
          <p className="hidden text-sm font-semibold text-slate-400 lg:block">טוען ניווט…</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen min-h-0 w-[78px] shrink-0 flex-col border-l border-white/10 bg-[#081224] shadow-luxury lg:w-72">
      <div className="shrink-0 px-3 pt-5 lg:px-5 lg:pt-6">
        <Link href="/" className="flex items-center justify-center gap-3 lg:justify-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d4af37] text-base font-black text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.15)]">
            W
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="text-sm font-black tracking-[0.12em] text-white">WEGO BUSINESS</p>
            <p className="font-arabic-brand mt-1 text-xl font-bold leading-snug text-luxury-gold">
              حلويات القدس
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400">מערכת ניהול ERP</p>
          </div>
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-6 pt-6 [-webkit-overflow-scrolling:touch] lg:px-5 lg:pt-8">
        {anyNav ? (
          <nav className="space-y-5">
            <div>
              <SectionTitle>ראשי</SectionTitle>
              <div className="space-y-1">
                <NavLink
                  item={{
                    label: "דף הבית",
                    href: "/",
                    eyebrow: "Dashboard",
                    permission: "financial_registration",
                    icon: LayoutDashboard,
                  }}
                />
              </div>
            </div>

            {financeVisible.length > 0 ? (
              <div>
                <SectionTitle>פורטל כספים</SectionTitle>
                <div className="space-y-1">
                  {financeVisible.map((item) => (
                    <NavLink key={item.href} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {managementVisible.length > 0 || adminVisible.length > 0 ? (
              <div>
                <SectionTitle>פורטל ניהול ותפעול</SectionTitle>
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

            {showMyTasksNav ? (
              <div>
                <SectionTitle>המשימות שלי</SectionTitle>
                <Link
                  href="/employee/tasks"
                  title="המשימות שלי"
                  className={`group/sidebar-item relative flex min-h-[54px] items-center justify-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold transition duration-300 ease-out lg:justify-start lg:px-3 ${
                    pathname === "/employee/tasks" || pathname.startsWith("/employee/tasks/")
                      ? "border-r-[3px] border-[#d4af37] bg-[linear-gradient(90deg,rgba(212,175,55,.18),transparent)] text-white shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                      : "text-slate-300 hover:translate-x-[-3px] hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border transition duration-300 ease-out group-hover/sidebar-item:scale-[1.08] ${
                      pathname === "/employee/tasks" || pathname.startsWith("/employee/tasks/")
                        ? "border-[#d4af37]/40 bg-[linear-gradient(135deg,#d4af37,#f3d36a)] text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.22)]"
                        : "border-white/10 bg-white/[0.04] text-slate-400 group-hover/sidebar-item:border-[#d4af37]/45 group-hover/sidebar-item:text-[#d4af37] group-hover/sidebar-item:shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                    }`}
                  >
                    <CheckSquare className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="hidden min-w-0 truncate lg:block">המשימות שלי</span>
                  <span className="pointer-events-none absolute right-[70px] z-50 hidden whitespace-nowrap rounded-xl border border-white/10 bg-[#0d1a30] px-3 py-2 text-xs font-bold text-white opacity-0 shadow-xl transition group-hover/sidebar-item:flex group-hover/sidebar-item:opacity-100 lg:hidden">
                    המשימות שלי
                  </span>
                </Link>
              </div>
            ) : null}
          </nav>
        ) : null}
      </div>
    </aside>
  );
}
