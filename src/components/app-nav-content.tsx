"use client";

import {
  Archive,
  Banknote,
  BookMarked,
  Activity,
  CheckSquare,
  ChefHat,
  Clock3,
  LayoutDashboard,
  Package,
  PackageCheck,
  ReceiptText,
  LineChart,
  TrendingUp,
  Truck,
  UserCircle2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import type { PagePermission, PermissionKey } from "@/lib/auth/permissions";

export type NavItem = {
  labelKey: string;
  href: string;
  permission: PermissionKey | PagePermission;
  icon: LucideIcon;
  /** מוצג לכל משתמש מחובר (לא רק לפי הרשאה) */
  showForAllAuthenticated?: boolean;
  /** נתיבים נוספים שמסמנים את הפריט כפעיל */
  activePrefixes?: string[];
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
    activePrefixes: ["/finance/ledgers"],
  },
  {
    labelKey: "nav.cashflow",
    href: "/finance/cashflow",
    permission: "cash_flow",
    icon: TrendingUp,
  },
  {
    labelKey: "nav.cashflowForecast",
    href: "/finance/cashflow-forecast",
    permission: "cash_flow",
    icon: LineChart,
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
    labelKey: "nav.team",
    href: "/ops/team",
    permission: "tasks",
    icon: Users,
    activePrefixes: ["/ops/team", "/admin/workflows", "/admin/work-status", "/admin/staff", "/ops/attendance"],
  },
  {
    labelKey: "nav.orders",
    href: "/ops/orders",
    permission: "tasks",
    icon: Package,
    activePrefixes: ["/ops/orders", "/admin/daily-orders", "/admin/future-orders", "/admin/wedding-orders"],
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

export const adminOnlyNav: NavItem[] = [
  {
    labelKey: "nav.users",
    href: "/admin/users",
    permission: "SUPER_ADMIN_ONLY",
    icon: UserCog,
  },
];

function canShowNavItem(
  item: NavItem,
  role: "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE",
  permissions: Set<string>,
): boolean {
  if (item.showForAllAuthenticated) return true;
  if (item.permission === "ADMIN_ONLY") {
    return role === "SUPER_ADMIN" || role === "ADMIN";
  }
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
  const prefixes = item.activePrefixes?.length ? item.activePrefixes : [item.href];
  const active =
    item.href === "/"
      ? pathname === "/"
      : prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={label}
      onClick={onNavigate}
      className={`group/sidebar-item relative flex min-h-10 items-center justify-center gap-2.5 rounded-xl px-2 py-1 text-sm font-bold transition duration-300 ease-out lg:justify-start lg:px-2.5 ${
        compact ? "min-h-11 w-full justify-start px-3 py-2" : ""
      } ${
        active
          ? "border-r-[3px] border-[#c9a227] bg-[linear-gradient(90deg,rgba(201,162,39,.22),transparent)] text-white shadow-[0_0_24px_rgba(201,162,39,0.2)]"
          : "text-slate-300 hover:translate-x-[-3px] hover:bg-white/[0.07] hover:text-white hover:shadow-[0_0_12px_rgba(201,162,39,0.08)]"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition duration-300 ease-out group-hover/sidebar-item:scale-[1.08] ${
          active
            ? "border-[#c9a227]/55 bg-[linear-gradient(135deg,#c9a227,#e8d48a)] text-[#081224] shadow-[0_0_20px_rgba(201,162,39,0.5)]"
            : "border-white/10 bg-white/[0.04] text-slate-400 group-hover/sidebar-item:border-[#c9a227]/45 group-hover/sidebar-item:text-[#c9a227] group-hover/sidebar-item:shadow-[0_0_14px_rgba(201,162,39,0.18)]"
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className={`min-w-0 ${compact ? "block" : "hidden lg:block"}`}>
        <span className="block truncate">{label}</span>
      </span>
    </Link>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 px-2 lg:mb-1 lg:block">
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
  const managementVisible = managementNav.filter((i) => {
    if (i.href === "/ops/orders") {
      return (
        canShowNavItem(i, role, permSet) ||
        role === "ADMIN" ||
        permSet.has("wedding_orders")
      );
    }
    return canShowNavItem(i, role, permSet);
  });
  const adminVisible = adminOnlyNav.filter((i) => canShowNavItem(i, role, permSet));

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

  const employeePortalNav: NavItem[] = [
    {
      labelKey: "nav.employeeHome",
      href: "/employee",
      permission: "employee_clock",
      icon: LayoutDashboard,
      showForAllAuthenticated: true,
    },
    {
      labelKey: "nav.workStatus",
      href: "/employee/work-status",
      permission: "employee_clock",
      icon: Activity,
    },
    {
      labelKey: "nav.dailyOrders",
      href: "/admin/daily-orders",
      permission: "employee_clock",
      icon: Package,
      showForAllAuthenticated: true,
    },
    { labelKey: "nav.myHours", href: "/employee/hours", permission: "employee_clock", icon: Clock3 },
    {
      labelKey: "nav.profile",
      href: "/employee/profile",
      permission: "employee_clock",
      icon: UserCircle2,
      showForAllAuthenticated: true,
    },
  ];
  const employeePortalVisible = employeePortalNav.filter((i) => canShowNavItem(i, role, permSet));

  if (role === "EMPLOYEE") {
    return (
      <nav className="space-y-5 px-3 pb-8 pt-4 lg:px-0 lg:pb-0 lg:pt-0">
        {employeePortalVisible.length > 0 ? (
          <div>
            <SectionTitle>{t("nav.sectionEmployee")}</SectionTitle>
            <div className="space-y-1">
              {employeePortalVisible.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
              ))}
            </div>
          </div>
        ) : null}

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

        {managementVisible.length > 0 ? (
          <div>
            <SectionTitle>{t("nav.sectionManagement")}</SectionTitle>
            <div className="space-y-1">
              {managementVisible.map((item) => (
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
                    ? "border-r-[3px] border-[#c9a227] bg-[linear-gradient(90deg,rgba(201,162,39,.12),transparent)] text-white shadow-sm"
                    : "text-slate-300 hover:translate-x-[-3px] hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span
                  className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border transition duration-300 ease-out group-hover/sidebar-item:scale-[1.08] ${
                    pathname === "/employee/tasks" || pathname.startsWith("/employee/tasks/")
                      ? "border-[#c9a227]/35 bg-[linear-gradient(135deg,#c9a227,#d4bc5c)] text-[#081224] shadow-sm"
                      : "border-white/10 bg-white/[0.04] text-slate-400 group-hover/sidebar-item:border-[#c9a227]/40 group-hover/sidebar-item:text-[#c9a227]"
                  }`}
                >
                  <CheckSquare className="h-5 w-5" aria-hidden />
                </span>
                <span className={`min-w-0 truncate ${compact ? "block" : "hidden lg:block"}`}>
                  {t("nav.myTasks")}
                </span>
              </Link>
            </div>
          </div>
        ) : null}
      </nav>
    );
  }

  return (
    <nav className="space-y-3 px-1 pb-3 pt-1 lg:px-0 lg:pb-2 lg:pt-0">
      <div>
        <SectionTitle>{t("nav.sectionMain")}</SectionTitle>
        <div className="space-y-0.5">
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
          {showMyTasksNav ? (
            <NavLink
              item={{
                labelKey: "nav.myTasks",
                href: "/employee/tasks",
                permission: "tasks",
                icon: CheckSquare,
                showForAllAuthenticated: true,
              }}
              onNavigate={onNavigate}
              compact={compact}
            />
          ) : null}
        </div>
      </div>

      {financeVisible.length > 0 ? (
        <div>
          <SectionTitle>{t("nav.sectionFinance")}</SectionTitle>
          <div className="space-y-0.5">
            {financeVisible.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
          </div>
        </div>
      ) : null}

      {managementVisible.length > 0 || adminVisible.length > 0 ? (
        <div>
          <SectionTitle>{t("nav.sectionManagement")}</SectionTitle>
          <div className="space-y-0.5">
            {managementVisible.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
            {adminVisible.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={onNavigate} compact={compact} />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
