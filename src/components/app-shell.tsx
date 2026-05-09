"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const workerPortal = pathname === "/worker" || pathname.startsWith("/worker/");

  if (workerPortal) {
    return <main className="min-h-screen px-4 py-6 sm:px-8">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-black tracking-[0.12em]">WEGO</p>
              <p className="text-xs font-semibold text-slate-500">מערכת ניהול ERP</p>
            </div>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
              פורטל אדמין
            </span>
          </div>
        </header>
        <main className="flex-1 px-5 py-6 sm:px-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
