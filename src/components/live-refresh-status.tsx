"use client";

import { useI18n } from "@/components/i18n-provider";
import type { LiveRefreshUiStatus } from "@/hooks/use-live-refresh";

export type LiveSaveStatus = "idle" | "saving" | "saved" | "error";

export function LiveRefreshStatus({
  status,
  unsaved = false,
  saveStatus = "idle",
  ready = false,
}: {
  status: LiveRefreshUiStatus;
  unsaved?: boolean;
  saveStatus?: LiveSaveStatus;
  /** Show "updated" after the first successful page load */
  ready?: boolean;
}) {
  const { t } = useI18n();

  let text: string | null = null;
  let className = "text-emerald-700";

  if (saveStatus === "saving") {
    text = t("liveRefresh.saving");
    className = "text-slate-500";
  } else if (saveStatus === "error") {
    text = t("liveRefresh.saveFailed");
    className = "text-rose-700";
  } else if (saveStatus === "saved") {
    text = t("liveRefresh.saved");
    className = "text-emerald-700";
  } else if (unsaved) {
    text = t("liveRefresh.unsaved");
    className = "text-amber-700";
  } else if (status === "refreshing") {
    text = t("liveRefresh.refreshing");
    className = "text-slate-500";
  } else if (status === "error") {
    text = t("liveRefresh.failed");
    className = "text-amber-800";
  } else if (status === "updated" || ready) {
    text = t("liveRefresh.updated");
    className = "text-emerald-700";
  }

  if (!text) return null;

  return (
    <p className={`text-[11px] font-bold ${className}`} aria-live="polite">
      {text}
    </p>
  );
}
