"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { KeyRound, StickyNote } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/components/i18n-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { NavbarBrand } from "@/components/brand/sidebar-brand";
import { StaffAlertsBell } from "@/components/staff-alerts-bell";
import { ChangePasswordDialog } from "@/components/auth/change-password-dialog";

type SessionBarProps = {
  className?: string;
};

export function SessionBar({ className }: SessionBarProps) {
  const pathname = usePathname();
  const { user, loading, logout, refresh } = useAuth();
  const { t } = useI18n();
  const [pwOpen, setPwOpen] = useState(false);
  const [openNotesCount, setOpenNotesCount] = useState(0);

  const forced = Boolean(user?.mustChangePassword);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetch("/api/me/employee-notes?status=open&preview=1", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; data?: { openCount?: number } }) => {
        if (!cancelled && json.ok && json.data) {
          setOpenNotesCount(json.data.openCount ?? 0);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!forced) return;
    queueMicrotask(() => setPwOpen(true));
  }, [forced]);

  if (pathname === "/login" || loading || !user) {
    return null;
  }

  const roleLabel =
    user.role === "SUPER_ADMIN"
      ? t("roles.SUPER_ADMIN")
      : user.role === "ADMIN"
        ? t("roles.ADMIN")
        : t("roles.EMPLOYEE");

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-sm text-slate-700 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <NavbarBrand className="hidden md:inline-flex" />
        <span>
          {t("session.hello")} <strong className="font-bold text-slate-900">{user.fullName}</strong>
        </span>
        <span className="rounded-full bg-luxury-navy-rich px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-luxury-gold">
          {roleLabel}
        </span>
        {user.nationalId ? (
          <span
            className="hidden rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-black tabular-nums text-slate-700 sm:inline"
            title={t("session.nationalId")}
            dir="ltr"
          >
            {t("session.nationalId")} {user.nationalId}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <LanguageSwitcher />
        <Link
          href="/my-notes"
          className="relative inline-flex min-h-[36px] items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
          title={t("nav.myNotes")}
        >
          <StickyNote className="h-3.5 w-3.5 text-[#c9a227]" aria-hidden />
          <span className="hidden sm:inline">{t("nav.myNotes")}</span>
          {openNotesCount > 0 ? (
            <span className="absolute -top-1.5 -end-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black text-white">
              {openNotesCount > 9 ? "9+" : openNotesCount}
            </span>
          ) : null}
        </Link>
        <StaffAlertsBell />
        <button
          type="button"
          onClick={() => setPwOpen(true)}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
          title={t("session.changePassword")}
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          {t("session.passwordShort")}
        </button>
        <button
          type="button"
          onClick={() => void logout()}
          className="min-h-[44px] px-1 text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-800"
        >
          {t("session.logout")}
        </button>
      </div>

      <ChangePasswordDialog
        open={pwOpen}
        forced={forced}
        onClose={() => {
          if (!forced) setPwOpen(false);
        }}
        onSuccess={() => {
          setPwOpen(false);
          void refresh({ sync: true });
        }}
      />
    </div>
  );
}
