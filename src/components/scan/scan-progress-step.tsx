"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";

export function ScanProgressStep({
  label,
  state,
}: {
  label: string;
  state: "done" | "active" | "pending";
}) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          state === "done"
            ? "bg-emerald-50 text-emerald-600"
            : state === "active"
              ? "bg-blue-50 text-blue-600"
              : "bg-slate-50 text-slate-300"
        }`}
        aria-hidden
      >
        {state === "done" ? (
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
        ) : state === "active" ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
        ) : (
          <Circle className="h-3.5 w-3.5" strokeWidth={2} />
        )}
      </span>
      <span
        className={
          state === "done"
            ? "font-medium text-emerald-800"
            : state === "active"
              ? "font-medium text-blue-800"
              : "text-slate-400"
        }
      >
        {label}
      </span>
    </li>
  );
}
