"use client";

import { Menu, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useMobileNav } from "@/components/mobile-nav-context";
import { BrandLogoMini } from "@/components/brand/brand-logo";
import { StaffAlertsBell } from "@/components/staff-alerts-bell";

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function MobileAppHeader() {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const { toggleNav } = useMobileNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (loading || !user) {
    return (
      <header className="sticky top-0 z-[130] flex h-14 items-center border-b border-slate-200 bg-white px-3 shadow-sm lg:hidden">
        <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-[130] flex h-14 min-h-[56px] items-center gap-2 border-b border-slate-200 bg-white px-2 shadow-sm lg:hidden ps-[max(8px,env(safe-area-inset-start))] pe-[max(8px,env(safe-area-inset-end))] pt-[max(4px,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={toggleNav}
        className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 transition hover:bg-slate-100"
        aria-label={t("mobileNav.openMenu")}
      >
        <Menu className="h-6 w-6" aria-hidden />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <BrandLogoMini size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-black tracking-wide text-slate-500">{t("meta.erpShort")}</p>
          <p className="truncate text-sm font-bold text-slate-900">{user.fullName}</p>
        </div>
      </div>

      <LanguageSwitcher className="shrink-0 max-[380px]:hidden" />

      <div className="flex shrink-0 items-center gap-1">
        <StaffAlertsBell />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full border border-slate-200 bg-luxury-navy-rich text-xs font-black text-luxury-gold"
            aria-label={t("session.accountMenu")}
            aria-expanded={menuOpen}
          >
            {initials(user.fullName)}
          </button>
          {menuOpen ? (
            <div className="absolute end-0 z-[160] mt-2 w-56 rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
              <p className="border-b border-slate-100 px-3 pb-2 text-sm font-bold text-slate-900">{user.fullName}</p>
              <div className="flex justify-center border-b border-slate-100 px-2 py-2">
                <LanguageSwitcher variant="pills" className="flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-1.5 py-1 text-[11px] font-bold text-slate-700" />
              </div>
              <button
                type="button"
                className="flex w-full min-h-[44px] items-center gap-2 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void logout()}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                {t("session.logout")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
