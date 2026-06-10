"use client";

import { Plus, ScanLine } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type EntryMode = "manual" | "scan";

type Props = {
  mode: EntryMode;
  onManual: () => void;
  onScan: () => void;
  disabled?: boolean;
};

export function RegisterEntryModeBar({ mode, onManual, onScan, disabled }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onManual}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition ${
          mode === "manual"
            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
            : "text-slate-600 hover:bg-white/70"
        } disabled:opacity-50`}
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("scan.modeManual")}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onScan}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition ${
          mode === "scan"
            ? "bg-rose-600 text-white shadow-sm"
            : "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
        } disabled:opacity-50`}
      >
        <ScanLine className="h-4 w-4" aria-hidden />
        {t("scan.modeScan")}
      </button>
    </div>
  );
}
