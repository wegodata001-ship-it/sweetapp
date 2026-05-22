"use client";

import {
  Activity,
  CheckSquare,
  Clock3,
  Gem,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { useMobileNav } from "@/components/mobile-nav-context";

type Tab = {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  match: (p: string) => boolean;
};

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user } = useAuth();
  const { openNav } = useMobileNav();

  if (!user) return null;

  const permSet = new Set(user.permissions);
  const role = user.role;
  const worker = pathname.startsWith("/worker");
  // Hide the bottom bar entirely on the clock-in gate.
  if (pathname.startsWith("/employee/clock")) return null;

  const showMyTasksNav =
    role === "SUPER_ADMIN" ||
    role === "EMPLOYEE" ||
    role === "ADMIN" ||
    permSet.has("employee_clock") ||
    permSet.has("tasks");

  const showWedding = role === "SUPER_ADMIN" || role === "ADMIN";

  let tabs: Tab[];

  if (role === "EMPLOYEE") {
    // Focused 4-tab employee portal (Home / My Tasks / Hours / Profile).
    tabs = [
      { href: "/employee", labelKey: "mobileNav.employeeHome", icon: LayoutDashboard, match: (p) => p === "/employee" },
      { href: "/admin/daily-orders", labelKey: "mobileNav.dailyOrders", icon: Package, match: (p) => p.startsWith("/admin/daily-orders") || p.startsWith("/admin/future-orders") },
      { href: "/employee/work-status", labelKey: "mobileNav.workStatus", icon: Activity, match: (p) => p.startsWith("/employee/work-status") },
      { href: "/employee/hours", labelKey: "mobileNav.myHours", icon: Clock3, match: (p) => p.startsWith("/employee/hours") || p.startsWith("/employee/attendance") },
    ];
  } else {
    tabs = [{ href: "/", labelKey: "mobileNav.home", icon: LayoutDashboard, match: (p) => p === "/" }];
    if (worker) {
      tabs.push({
        href: "/worker/tasks",
        labelKey: "mobileNav.workerTasks",
        icon: CheckSquare,
        match: (p) => p.startsWith("/worker/tasks"),
      });
    } else {
      if (showMyTasksNav) {
        tabs.push({
          href: "/employee/tasks",
          labelKey: "mobileNav.myTasks",
          icon: CheckSquare,
          match: (p) => p.startsWith("/employee/tasks"),
        });
        tabs.push({
          href: "/employee/hours",
          labelKey: "mobileNav.myHours",
          icon: Clock3,
          match: (p) => p.startsWith("/employee/hours") || p.startsWith("/employee/attendance"),
        });
      }
      if (showWedding) {
        tabs.push({
          href: "/admin/wedding-orders",
          labelKey: "mobileNav.weddingOrders",
          icon: Gem,
          match: (p) => p.startsWith("/admin/wedding-orders"),
        });
      }
    }
  }

  const visibleTabs = tabs.slice(0, 4);

  const itemClass = (active: boolean) =>
    `flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-bold transition touch-manipulation ${
      active ? "text-luxury-gold" : "text-slate-500 hover:text-slate-800"
    }`;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[120] flex border-t border-slate-200 bg-white/95 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 shadow-[0_-4px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm lg:hidden"
      aria-label={t("mobileNav.bottomBar")}
    >
      {visibleTabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.match(pathname);
        return (
          <Link key={tab.href} href={tab.href} className={itemClass(active)}>
            <Icon className={`h-6 w-6 shrink-0 ${active ? "text-luxury-gold" : ""}`} aria-hidden />
            <span className="max-w-[72px] truncate">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
      <button type="button" className={itemClass(false)} onClick={openNav}>
        <MoreHorizontal className="h-6 w-6 shrink-0" aria-hidden />
        <span className="max-w-[72px] truncate">{t("mobileNav.more")}</span>
      </button>
    </nav>
  );
}
