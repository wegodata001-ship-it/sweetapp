"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { SessionBar } from "@/components/session-bar";

type AppShellProps = {
  children: ReactNode;
};

/** ריפוד תוכן ERP קומפקטי — 18px דסקטופ, 10px מובייל */
const MAIN_PAD =
  "flex-1 bg-white px-[18px] py-[18px] max-md:px-2.5 max-md:py-2.5";

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
        <main className="px-[18px] py-[18px] max-md:px-2.5 max-md:py-2.5">{children}</main>
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
        <main className={MAIN_PAD}>{children}</main>
      </div>
    </div>
  );
}
