"use client";

import { Bell, RefreshCw, Search } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { StaffAlertsBell } from "@/components/staff-alerts-bell";

type DashboardHeaderProps = {
  updatedAt: string | null;
  loading: boolean;
  onRefresh: () => void;
};

export function DashboardHeader({ updatedAt, loading, onRefresh }: DashboardHeaderProps) {
  const { t } = useI18n();
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <header className="tcg-fade-in flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-l from-white via-slate-50/80 to-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-bold tracking-wide text-[#c9a227]">{t("dashboard.redesign.kicker")}</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{t("dashboard.redesign.title")}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{t("dashboard.redesign.subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex">
          <Search className="h-4 w-4 text-slate-400" aria-hidden />
          <input
            type="search"
            placeholder={t("dashboard.redesign.searchPlaceholder")}
            className="w-36 bg-transparent text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400 lg:w-48"
          />
        </div>
        <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
          {dateLabel}
        </span>
        <span className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          {t("dashboard.redesign.lastUpdate")}: {timeLabel}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-[#c9a227]/40 hover:text-[#081224] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {t("dashboard.redesign.refresh")}
        </button>
        <StaffAlertsBell />
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 lg:hidden">
          <Bell className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </header>
  );
}
