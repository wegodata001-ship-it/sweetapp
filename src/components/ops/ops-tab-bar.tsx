"use client";

import Link from "next/link";

export type OpsTab = { id: string; label: string; href: string; count?: number };

export function OpsTabBar({ tabs, active }: { tabs: OpsTab[]; active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black ${
              on
                ? "border-[#c9a227] bg-[#081224] text-white"
                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" ? (
              <span className={`rounded-full px-2 py-0.5 text-xs ${on ? "bg-white/15" : "bg-slate-100"}`}>
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
