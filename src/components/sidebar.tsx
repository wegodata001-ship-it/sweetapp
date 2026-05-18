"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { AppNavContent } from "@/components/app-nav-content";

export function Sidebar() {
  const { t } = useI18n();

  return (
    <aside className="sticky top-0 hidden h-screen min-h-0 w-[78px] shrink-0 flex-col border-l border-white/10 bg-[#081224] shadow-luxury lg:flex lg:w-72">
      <div className="shrink-0 px-3 pt-5 lg:px-5 lg:pt-6">
        <Link href="/" className="flex items-center justify-center gap-3 lg:justify-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d4af37] text-base font-black text-[#081224] shadow-[0_0_20px_rgba(212,175,55,0.15)]">
            W
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="text-sm font-black tracking-[0.12em] text-white">{t("meta.appTitle")}</p>
            <p className="font-arabic-brand mt-1 text-xl font-bold leading-snug text-luxury-gold">{t("meta.brandSubtitle")}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">{t("meta.erpTagline")}</p>
          </div>
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-6 pt-6 [-webkit-overflow-scrolling:touch] lg:px-5 lg:pt-8">
        <AppNavContent variant="sidebar" />
      </div>
    </aside>
  );
}
