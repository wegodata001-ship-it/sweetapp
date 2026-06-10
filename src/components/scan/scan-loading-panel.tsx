"use client";

import { FileSearch, Loader2, ScanLine } from "lucide-react";
import { ScanProgressStep } from "./scan-progress-step";
import {
  SCAN_PROGRESS_ORDER,
  type ScanProgressPhase,
} from "@/lib/document-scan/scan-progress";

type ProgressLabels = Record<ScanProgressPhase, string>;

function progressStateForPhase(
  step: ScanProgressPhase,
  current: ScanProgressPhase | null,
): "done" | "active" | "pending" {
  if (!current) return step === "upload" ? "active" : "pending";
  const stepIndex = SCAN_PROGRESS_ORDER.indexOf(step);
  const currentIndex = SCAN_PROGRESS_ORDER.indexOf(current);
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

type Props = {
  title: string;
  subtitle: string;
  scanProgress: ScanProgressPhase | null;
  progressLabels: ProgressLabels;
};

export function ScanLoadingPanel({ title, subtitle, scanProgress, progressLabels }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-blue-50" />
        <ScanLine className="relative h-7 w-7 text-blue-600" strokeWidth={1.75} aria-hidden />
        <Loader2
          className="absolute -inset-1 h-[4.5rem] w-[4.5rem] animate-spin text-blue-400/40"
          strokeWidth={1.25}
          aria-hidden
        />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">{title}</p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-blue-700/90 transition-opacity duration-500">
          {subtitle}
        </p>
      </div>
      <ol className="mt-1 w-full max-w-xs space-y-2.5 rounded-xl border border-blue-100/80 bg-blue-50/40 p-4 text-start">
        {SCAN_PROGRESS_ORDER.map((step) => (
          <ScanProgressStep
            key={step}
            label={progressLabels[step]}
            state={progressStateForPhase(step, scanProgress)}
          />
        ))}
      </ol>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <FileSearch className="h-3.5 w-3.5" aria-hidden />
        <span>{progressLabels.ai}</span>
      </div>
    </div>
  );
}
