"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { BrandLogoMini } from "@/components/brand/brand-logo";

type SidebarBrandProps = {
  className?: string;
  /** drawer = always show titles (mobile menu) */
  variant?: "sidebar" | "drawer";
};

export function SidebarBrand({ className, variant = "sidebar" }: SidebarBrandProps) {
  const { t } = useI18n();
  const textClass = variant === "drawer" ? "flex" : "hidden lg:flex";
  const layoutClass =
    variant === "drawer"
      ? "flex-row items-center gap-2.5 text-start"
      : "flex-col items-center gap-1.5 text-center lg:items-center";

  return (
    <Link
      href="/"
      className={`group flex transition hover:opacity-95 ${layoutClass} ${className ?? ""}`}
    >
      <BrandLogoMini size={44} priority className="shrink-0 transition group-hover:shadow-[0_0_24px_rgba(212,175,55,0.22)]" />
      <div className={`${textClass} min-w-0 flex-col gap-0.5`}>
        <p className="text-[12px] font-black leading-tight tracking-[0.12em] text-white">{t("meta.appTitle")}</p>
        <p className="text-[9px] font-bold leading-tight tracking-[0.2em] text-[#d4af37]/90">
          {t("meta.erpControlPanel")}
        </p>
      </div>
    </Link>
  );
}

/** Inline row: mini logo + WEGO ERP — top bars */
export function NavbarBrand({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2 py-1 shadow-sm transition hover:border-[#d4af37]/35 hover:shadow-md ${className ?? ""}`}
      title={t("meta.appTitle")}
    >
      <BrandLogoMini size={32} />
      <span className="hidden text-[11px] font-black tracking-[0.08em] text-slate-800 sm:inline">
        {t("meta.erpShort")}
      </span>
    </Link>
  );
}
