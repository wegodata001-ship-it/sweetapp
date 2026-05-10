"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { SessionBar } from "@/components/session-bar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const workerPortal = pathname === "/worker" || pathname.startsWith("/worker/");
  const loginPage = pathname === "/login";

  if (loginPage) {
    return <>{children}</>;
  }

  if (workerPortal) {
    return (
      <div className="min-h-screen bg-white">
        <SessionBar />
        <main className="px-4 py-6 sm:px-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <SessionBar />
        <header className="border-b border-white/10 bg-luxury-navy-rich px-5 py-4 shadow-luxury-sm lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black tracking-[0.14em] text-white">
                WEGO BUSINESS
              </p>
              <p className="font-arabic-brand mt-1 text-lg font-bold leading-snug text-luxury-gold">
                حلويات القدس
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-400">
                מערכת ניהול ארגונית
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-luxury-gold px-3 py-1.5 text-xs font-bold text-luxury-charcoal shadow-sm">
              פורטל אדמין
            </span>
          </div>
        </header>
        <main className="flex-1 bg-white px-5 py-6 sm:px-8 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
