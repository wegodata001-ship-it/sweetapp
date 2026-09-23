"use client";

import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";

type Phase = "idle" | "confirm" | "working" | "done" | "error";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const plain = header.match(/filename="([^"]+)"/i);
  return plain?.[1] ?? null;
}

export function BusinessDataExportCard() {
  const { t, dir } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function startExport() {
    setPhase("working");
    setError(null);
    try {
      const res = await fetch("/api/admin/system/business-export", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? t("admin.system.businessExport.failed"));
        setPhase("error");
        return;
      }
      const blob = await res.blob();
      const name =
        fileNameFromDisposition(res.headers.get("Content-Disposition")) ??
        `WEGO_נתוני_העסק_${new Date().toISOString().slice(0, 10)}.zip`;
      downloadBlob(blob, name);
      setPhase("done");
    } catch {
      setError(t("admin.system.businessExport.failed"));
      setPhase("error");
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
          {t("admin.system.businessExport.sectionTitle")}
        </p>
        <h2 className="mt-1 text-lg font-black text-slate-900">
          {t("admin.system.businessExport.cardTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("admin.system.businessExport.cardBody")}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPhase("confirm");
          }}
          disabled={phase === "working"}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50"
        >
          {phase === "working" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          {t("admin.system.businessExport.download")}
        </button>
        {phase === "working" ? (
          <p className="mt-3 text-sm font-semibold text-slate-600">
            {t("admin.system.businessExport.preparing")}
            <span className="mt-1 block text-xs font-medium text-slate-500">
              {t("admin.system.businessExport.preparingHint")}
            </span>
          </p>
        ) : null}
        {phase === "done" ? (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("admin.system.businessExport.done")}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      </section>

      {phase === "confirm" ? (
        <div
          dir={dir}
          className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhase("idle");
          }}
        >
          <div className="w-full max-w-md rounded-[24px] bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">
              {t("admin.system.businessExport.confirmTitle")}
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">
              {t("admin.system.businessExport.confirmBody")}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="flex-1 rounded-2xl border border-[#e7ecf5] py-2.5 text-sm font-black text-slate-800 hover:bg-slate-50"
              >
                {t("admin.system.businessExport.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void startExport()}
                className="flex-1 rounded-2xl bg-violet-700 py-2.5 text-sm font-black text-white hover:bg-violet-800"
              >
                {t("admin.system.businessExport.start")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
