import type { CSSProperties } from "react";
import type { TranslateFn } from "@/lib/i18n/translator";
import type { ShelfStatusKind, ShelfSummary } from "./types";

export function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatRelativeTime(iso: string | null | undefined, bcp47: string): string {
  if (!iso) return "—";
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    if (diffMs < 0) return "—";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return bcp47 === "ar" ? "الآن" : bcp47 === "en" ? "Just now" : "עכשיו";
    if (mins < 60) {
      return bcp47 === "ar"
        ? `قبل ${mins} د`
        : bcp47 === "en"
          ? `${mins}m ago`
          : `לפני ${mins} דק׳`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 48) {
      return bcp47 === "ar"
        ? `قبل ${hours} س`
        : bcp47 === "en"
          ? `${hours}h ago`
          : `לפני ${hours} שע׳`;
    }
    const days = Math.floor(hours / 24);
    return bcp47 === "ar"
      ? `قبل ${days} ي`
      : bcp47 === "en"
        ? `${days}d ago`
        : `לפני ${days} ימים`;
  } catch {
    return "—";
  }
}

export function countDiffMeta(diff: number, t: TranslateFn) {
  if (diff < 0) {
    return {
      label: t("ops.inventory.countDashboard.statusShort"),
      borderClass: "border-rose-300 bg-gradient-to-br from-rose-50/90 to-white ring-rose-100",
      badgeClass: "bg-rose-100 text-rose-800 ring-rose-200/80",
      diffStyle: { color: "#dc2626" } as CSSProperties,
    };
  }
  if (diff > 0) {
    return {
      label: t("ops.inventory.countDashboard.statusSurplus"),
      borderClass: "border-amber-300 bg-gradient-to-br from-amber-50/90 to-white ring-amber-100",
      badgeClass: "bg-amber-100 text-amber-900 ring-amber-200/80",
      diffStyle: { color: "#d97706" } as CSSProperties,
    };
  }
  return {
    label: t("ops.inventory.countDashboard.statusMatch"),
    borderClass: "border-emerald-300 bg-gradient-to-br from-emerald-50/90 to-white ring-emerald-100",
    badgeClass: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
    diffStyle: { color: "#059669" } as CSSProperties,
  };
}

export function resolveShelfStatus(
  shelf: ShelfSummary,
  countedToday: boolean,
  recentActivity: boolean,
): ShelfStatusKind {
  if (shelf.shortageCount > 0) return "shortage";
  if (countedToday) return "counted";
  if (recentActivity) return "recent";
  return "pending";
}
