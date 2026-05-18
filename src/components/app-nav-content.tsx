"use client";

import {
  Archive,
  Banknote,
  BookMarked,
  CalendarClock,
  CheckSquare,
  ChefHat,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  PackageCheck,
  ReceiptText,
  TrendingUp,
  Truck,
  UserCircle2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import type { PermissionKey } from "@/lib/auth/permissions";

export type NavItem = {
  labelKey: string;
  href: string;
  permission: PermissionKey | "SUPER_ADMIN_ONLY";
  icon: LucideIcon;
};

export const financeNav: NavItem[] = [
  {
    labelKey: "nav.financeRegister",
    href: "/finance/register",
    permission: "financial_registration",
    icon: ReceiptText,
  },
  {
    labelKey: "nav.ledgers",
    href: "/finance/ledgers",
    permission: "ledger",
    icon: BookMarked,
  },
  {
    labelKey: "nav.cashflow",
    href: "/finance/cashflow",
    permission: "cash_flow",
    icon: TrendingUp,
  },
  {
    labelKey: "nav.checks",
    href: "/finance/checks",
    permission: "financial_registration",
    icon: Banknote,
  },
  {
    labelKey: "nav.archive",
    href: "/finance/archive",
    permission: "financial_registration",
    icon: Archive,
  },
  {
    labelKey: "nav.suppliersPrices",
    href: "/finance/suppliers-prices",
    permission: "financial_registration",
    icon: Truck,
  },
];

export const managementNav: NavItem[] = [
  {
    labelKey: "nav.adminTasks",
    href: "/admin/workflows",
    permission: "tasks",
    icon: ClipboardList,
  },
  {
    labelKey: "nav.futureOrders",
    href: "/admin/future-orders",
    permission: "tasks",
    icon: CalendarClock,
  },
  {
    labelKey: "nav.staff",
    href: "/admin/staff",
    permission: "tasks",
    icon: Clock3,
  },
  {
    labelKey: "nav.inventory",
    href: "/ops/inventory",
    permission: "inventory",
    icon: PackageCheck,
  },
  {
    labelKey: "nav.recipes",
    href: "/ops/recipes",
    permission: "tasks",
    icon: ChefHat,
  },
];

/**
 * Submenu items shown directly under the "Tasks" link in the sidebar.
 * They deep-link to anchored sections inside `/admin/workflows`.
 * Each entry uses an `id` selector so we can scroll smoothly on click.
 */
type TaskSubItem = { labelKey: string; href: string; anchorId: string };
const tasksSubMenu: TaskSubItem[] = [
  { labelKey: "nav.tasksSub.groups", href: "/admin/workflows#workflow-groups", anchorId: "workflow-groups" },
  { labelKey: "nav.tasksSub.runs", href: "/admin/workflows#workflow-runs", anchorId: "workflow-runs" },
  { labelKey: "nav.tasksSub.history", href: "/admin/workflows#workflow-history", anchorId: "workflow-history" },
];

export const adminOnlyNav: NavItem[] = [
  {
    labelKey: "nav.users",
    href: "/admin/users",
    permission: "SUPER_ADMIN_ONLY",
    icon: Users,
  },
];

function canShowNavItem(
  item: NavItem,
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE",
  permissions: Set<string>,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (item.permission === "SUPER_ADMIN_ONLY") return false;
  return permissions.has(item.permission);
}

function NavLink({
  item,
  onNavigate,
  compact,
}: {
  item: NavItem;
  onNavigate?: () => void;
  /** מובייל drawer — כפתורים גבוהים יותר */
  compact?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const label = t(item.labelKey);
  const active =
    item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={label}
      onClick={onNavigate}
      className={`group/sidebar-item relative flex min-h-[54px] items-center justify-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold transition duration-300 ease-out lg:justify-start lg:px-3 ${
        compact ? "min-h-[52px] w-full justify-start px-4 py-3" : ""
      } ${
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
      <span className={`min-w-0 ${compact ? "block" : "hidden lg:block"}`}>
        <span className="block truncate">{label}</span>
      </span>
    </Link>
  );
}

/**
 * Compact secondary list rendered indented under an active NavLink.
 * Each item scrolls smoothly to its anchor on the current page, and falls back
 * to a normal navigation if the anchor isn't on the page yet.
 */
function SubMenu({
  items,
  compact,
  onNavigate,
}: {
  items: { labelKey: string; href: string; anchorId: string }[];
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  return (
    <ul
      className={`mt-1 space-y-0.5 ${compact ? "ps-3" : "ps-3 lg:ps-12"}`}
      role="list"
    >
      {items.map((sub) => (
        <li key={sub.href}>
          <Link
            href={sub.href}
            onClick={(e) => {
              const el = document.getElementById(sub.anchorId);
              if (el) {
                e.preventDefault();
                el.scrollIntoView({ behavior: "smooth", block: "start" });
              }
              onNavigate?.();
            }}
            className="group/sidebar-sub-item flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-bold text-slate-400 transition hover:bg-white/[0.04] hover:text-white"
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-[#d4af37]/40 transition group-hover/sidebar-sub-item:bg-[#d4af37]" />
            <span className="truncate">{t(sub.labelKey)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 px-2 lg:mb-2 lg:block">
      <p className="text-[12px] font-black tracking-[0.05em] text-slate-400/55">{children}</p>
    </div>
  );
}

export type AppNavContentProps = {
  onNavigate?: () => void;
  /** מסך מלא (sidebar) או drawer מובייל */
  variant?: "sidebar" | "drawer";
};

export function AppNavContent({ onNavigate, variant = "sidebar" }: AppNavContentProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const permSet = user ? new Set(user.permissions) : new Set<string>();
  const role = user?.role ?? "EMPLOYEE";

  const financeVisible = financeNav.filter((i) => canShowNavItem(i, role, permSet));
  const managementVisible = managementNav.filter((i) => canShowNavItem(i, role, permSet));
  const adminVisible = adminOnlyNav.filter((i) => canShowNavItem(i, role, permSet));

  // Pure EMPLOYEEs get the simplified, focused sidebar (Home / My Tasks /
  // Hours / Profile) — no finance / admin sections. Admins still see the
  // full ERP sidebar plus the My-Tasks section for QA.
  const employeeOnlyMode = role === "EMPLOYEE";

  const showMyTasksNav =
    role === "SUPER_ADMIN" ||
    role === "EMPLOYEE" ||
    role === "ADMIN" ||
    permSet.has("employee_clock") ||
    permSet.has("tasks");

  const compact = variant === "drawer";

  if (loading) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm font-semibold text-slate-400">{t("common.loadingNav")}</p>
      </div>
    );
  }

  if (employeeOnlyMode) {
    // Focused employee portal sidebar — only the 4 items the spec calls for.
    const items: NavItem[] = [
      { labelKey: "nav.employeeHome", href: "/employee", permission: "employee_clock", icon: LayoutDashboard },
      { labelKey: "nav.myWorkflows", href: "/employee/workflows", permission: "employee_clock", icon: Workflow },
      { labelKey: "nav.myHours", href: "/employee/hours", permission: "employee_clock", icon: Clock3 },
      { labelKey: "nav.profile", href: "/employee/profile", permission: "employee_clock", icon: UserCircle2 },
    ];
    return (
      <nav className="space-y-5 px-3 pb-8 pt-4 lg:px-0 lg:pb-0 lg:pt-0">
        <div>
          <SectionTitle>{t("nav.sectionEmployee")}</SectionTitle>
          <div className="space-y-1">
            {items.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="space-y-5 px-3 pb-8 pt-4 lg:px-0 lg:pb-0 lg:pt-0">
      <div>
        <SectionTitle>{t("nav.sectionMain")}</SectionTitle>
        <div className="space-y-1">
          <NavLink
            item={{
              labelKey: "nav.home",
              href: "/",
              permission: "financial_registration",
              icon: LayoutDashboard,
            }}
            onNavigate={onNavigate}
            compact={compact}
          />
        </div>
      </div>

      {financeVisible.length > 0 ? (
        <div>
          <SectionTitle>{t("nav.sectionFinance")}</SectionTitle>
          <div className="space-y-1">
            {financeVisible.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
          </div>
        </div>
      ) : null}

      {managementVisible.length > 0 || adminVisible.length > 0 ? (
        <div>
          <SectionTitle>{t("nav.sectionManagement")}</SectionTitle>
          <div className="space-y-1">
            {managementVisible.map((item) => (
              <div key={item.href}>
                <NavLink item={item} onNavigate={onNavigate} compact={compact} />
                {item.href === "/admin/workflows" &&
                (pathname === "/admin/workflows" ||
                  pathname.startsWith("/admin/workflows/")) ? (
                  <SubMenu items={tasksSubMenu} compact={compact} onNavigate={onNavigate} />
                ) : null}
              </div>
            ))}
            {adminVisible.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
          </div>
        </div>
      ) : null}

      {showMyTasksNav ? (
        <div>
          <SectionTitle>{t("nav.sectionMyTasks")}</SectionTitle>
          <div className="space-y-1">
            <Link
              href="/employee/tasks"
              title={t("nav.myTasks")}
              onClick={onNavigate}
              className={`group/sidebar-item relative flex min-h-[54px] items-center justify-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold transition duration-300 ease-out ${
                compact ? "w-full justify-start px-4 py-3" : "lg:justify-start lg:px-3"
              } ${
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
              <span className={`min-w-0 truncate ${compact ? "block" : "hidden lg:block"}`}>{t("nav.myTasks")}</span>
            </Link>
            <Link
              href="/employee/workflows"
              title={t("nav.myWorkflows")}
              onClick={onNavigate}
              className={`group/sidebar-item relative flex min-h-[54px] items-center justify-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold transition duration-300 ease-out ${
                compact ? "w-full justify-start px-4 py-3" : "lg:justify-start lg:px-3"
              } ${
                pathname === "/employee/workflows" || pathname.startsWith("/employee/workflows/")
                  ? "border-r-[3px] border-[#d4af37] bg-[linear-gradient(90deg,rgba(212,175,55,.18),transparent)] text-white shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                  : "text-slate-300 hover:translate-x-[-3px] hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <span
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border transition duration-300 ease-out group-hover/sidebar-item:scale-[1.08] ${
                  pathname === "/employee/workflows" || pathname.startsWith("/employee/workflows/")
                    ? "border-[#d4af37]/40 bg-[linear-gradient(135deg,#d4af37,#f3d36a)] text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.22)]"
                    : "border-white/10 bg-white/[0.04] text-slate-400 group-hover/sidebar-item:border-[#d4af37]/45 group-hover/sidebar-item:text-[#d4af37] group-hover/sidebar-item:shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                }`}
              >
                <Workflow className="h-5 w-5" aria-hidden />
              </span>
              <span className={`min-w-0 truncate ${compact ? "block" : "hidden lg:block"}`}>{t("nav.myWorkflows")}</span>
            </Link>
            <Link
              href="/employee/attendance"
              title={t("nav.myAttendance")}
              onClick={onNavigate}
              className={`group/sidebar-item relative flex min-h-[54px] items-center justify-center gap-3 rounded-2xl px-2 py-2 text-[15px] font-bold transition duration-300 ease-out ${
                compact ? "w-full justify-start px-4 py-3" : "lg:justify-start lg:px-3"
              } ${
                pathname === "/employee/attendance" || pathname.startsWith("/employee/attendance/")
                  ? "border-r-[3px] border-[#d4af37] bg-[linear-gradient(90deg,rgba(212,175,55,.18),transparent)] text-white shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                  : "text-slate-300 hover:translate-x-[-3px] hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <span
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border transition duration-300 ease-out group-hover/sidebar-item:scale-[1.08] ${
                  pathname === "/employee/attendance" || pathname.startsWith("/employee/attendance/")
                    ? "border-[#d4af37]/40 bg-[linear-gradient(135deg,#d4af37,#f3d36a)] text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.22)]"
                    : "border-white/10 bg-white/[0.04] text-slate-400 group-hover/sidebar-item:border-[#d4af37]/45 group-hover/sidebar-item:text-[#d4af37] group-hover/sidebar-item:shadow-[0_0_20px_rgba(212,175,55,0.15)]"
                }`}
              >
                <Clock3 className="h-5 w-5" aria-hidden />
              </span>
              <span className={`min-w-0 truncate ${compact ? "block" : "hidden lg:block"}`}>
                {t("nav.myAttendance")}
              </span>
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
