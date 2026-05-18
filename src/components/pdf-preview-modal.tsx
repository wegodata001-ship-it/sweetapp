"use client";

import { Download, Printer, X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n-provider";

type Props = {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
};

export function PdfPreviewModal({ open, title, url, onClose }: Props) {
  const { t, dir } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.print();
  }, []);

  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = url;
    a.download = title.endsWith(".pdf") ? title : `${title}.pdf`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [title, url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !url) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[100] flex flex-col bg-black/75 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:p-6">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-t-xl border border-white/10 bg-[#0d1a30] px-4 py-3 text-white">
          <h2 id="pdf-modal-title" className="min-w-0 truncate text-sm font-black md:text-base">
            {title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-black hover:bg-white/20"
            >
              <Download className="h-4 w-4" aria-hidden />
              {t("common.download")}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-black hover:bg-white/20"
            >
              <Printer className="h-4 w-4" aria-hidden />
              {t("common.print")}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center rounded-lg border border-white/20 px-3 text-xs font-bold text-white/90 hover:bg-white/10 md:inline-flex"
            >
              {t("pdfModal.openInWindow")}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-black text-white hover:bg-rose-700"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" aria-hidden />
              {t("common.close")}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl border border-t-0 border-slate-800 bg-slate-900">
          <iframe
            ref={iframeRef}
            title={title}
            src={url}
            className="h-full min-h-[60vh] w-full bg-white"
          />
        </div>
      </div>
    </div>
  );
}
