"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { SidebarBrand } from "@/components/brand/sidebar-brand";
import { AppNavContent } from "@/components/app-nav-content";
import { useI18n } from "@/components/i18n-provider";
import { useMobileNav } from "@/components/mobile-nav-context";
import { PortalNavContent } from "@/components/portal-nav-content";

export function MobileNavDrawer() {
  const { open, closeNav } = useMobileNav();
  const pathname = usePathname();
  const { t } = useI18n();

  /** רק פורטל worker — ב־/employee נשאר הניווט המלא */
  const portalMode = pathname.startsWith("/worker");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[140] bg-black/50 backdrop-blur-[1px] lg:hidden"
        aria-label={t("common.close")}
        onClick={closeNav}
      />
      <aside
        className="fixed inset-y-0 z-[150] flex w-[min(92vw,320px)] max-w-[100vw] flex-col bg-[#081224] shadow-2xl lg:hidden end-0"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-3 pe-[max(12px,env(safe-area-inset-end))] ps-[max(12px,env(safe-area-inset-start))] pt-[max(12px,env(safe-area-inset-top))]">
          <SidebarBrand variant="drawer" className="items-start text-start" />
          <button
            type="button"
            onClick={closeNav}
            className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-xl border border-white/15 text-white transition hover:bg-white/10"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          {portalMode ? (
            <PortalNavContent onNavigate={closeNav} />
          ) : (
            <AppNavContent variant="drawer" onNavigate={closeNav} />
          )}
        </div>
      </aside>
    </>
  );
}
