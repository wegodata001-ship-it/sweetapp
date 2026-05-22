import type { TranslateFn } from "@/lib/i18n/translator";

export type CountLineStatus = "uncounted" | "match" | "short" | "surplus";

export function resolveCountLineStatus(
  actual: number | null,
  systemQty: number,
): CountLineStatus {
  if (actual === null || Number.isNaN(actual)) return "uncounted";
  const diff = actual - systemQty;
  if (diff === 0) return "match";
  if (diff < 0) return "short";
  return "surplus";
}

export function countStatusStyles(status: CountLineStatus) {
  switch (status) {
    case "match":
      return {
        row: "border-emerald-300/80 bg-emerald-50/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-emerald-200/60",
        dot: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
        glow: "from-emerald-400/20 to-transparent",
      };
    case "short":
      return {
        row: "border-rose-400/80 bg-rose-50/50 shadow-[0_0_22px_rgba(244,63,94,0.2)] ring-rose-200/70",
        dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.65)]",
        glow: "from-rose-400/25 to-transparent",
      };
    case "surplus":
      return {
        row: "border-amber-400/80 bg-amber-50/50 shadow-[0_0_20px_rgba(245,158,11,0.18)] ring-amber-200/70",
        dot: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.55)]",
        glow: "from-amber-400/22 to-transparent",
      };
    default:
      return {
        row: "border-violet-300/70 bg-violet-50/30 shadow-[0_0_16px_rgba(139,92,246,0.12)] ring-violet-200/50",
        dot: "bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.45)]",
        glow: "from-violet-400/18 to-transparent",
      };
  }
}

export function countStatusLabel(status: CountLineStatus, t: (key: string) => string): string {
  switch (status) {
    case "match":
      return t("statusMatch");
    case "short":
      return t("statusShort");
    case "surplus":
      return t("statusSurplus");
    default:
      return t("statusUncounted");
  }
}
