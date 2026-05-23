"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { SessionBar } from "@/components/session-bar";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { PermissionRouteGuard } from "@/components/permission-route-guard";

type AppShellProps = {
  children: ReactNode;
};

const MAIN_PAD =
  "flex-1 bg-white px-[18px] py-[18px] max-lg:px-3 max-lg:py-3 max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-[18px]";

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const workerPortal = pathname === "/worker" || pathname.startsWith("/worker/");
  const loginPage = pathname === "/login";
  const changePasswordPage = pathname === "/change-password" || pathname.startsWith("/change-password/");
  // The employee clock-in gate is the "front door" for employees with no
  // active session — show it without the rest of the chrome (no sidebar,
  // no mobile bottom nav) so they can't navigate around it.
  const employeeClockGate =
    pathname === "/employee/clock" || pathname.startsWith("/employee/clock/");

  if (loginPage || employeeClockGate || changePasswordPage) {
    return <>{children}</>;
  }

  if (workerPortal) {
    return (
      <MobileNavProvider>
        <PermissionRouteGuard />
        <div className="min-h-screen bg-white">
          <MobileAppHeader />
          <MobileNavDrawer />
          <SessionBar className="hidden lg:flex" />
          <main className={MAIN_PAD}>{children}</main>
          <MobileBottomNav />
        </div>
      </MobileNavProvider>
    );
  }

  return (
    <MobileNavProvider>
      <PermissionRouteGuard />
      <MobileAppHeader />
      <MobileNavDrawer />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-white">
          <SessionBar className="hidden lg:flex" />
          <main className={MAIN_PAD}>{children}</main>
        </div>
      </div>
      <MobileBottomNav />
    </MobileNavProvider>
  );
}
