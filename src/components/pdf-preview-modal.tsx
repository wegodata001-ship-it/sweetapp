"use client";

import { Download, Printer, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { fetchPdfBlob } from "@/lib/pdf/fetch-pdf-client";

type Props = {
  open: boolean;
  title: string;
  url: string;
  autoPrint?: boolean;
  onClose: () => void;
};

async function loadPdfBlob(url: string): Promise<Blob> {
  return fetchPdfBlob(url);
}

export function PdfPreviewModal({ open, title, url, autoPrint = false, onClose }: Props) {
  const { t, dir } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const printedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !url) return;
    let cancelled = false;
    let objectUrl = "";
    printedRef.current = false;
    setLoading(true);
    setFailed(false);
    setBlobUrl(null);
    void loadPdfBlob(url)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const sameOrigin = url.startsWith("/");
        if (!sameOrigin && error instanceof TypeError) {
          setBlobUrl(url);
          return;
        }
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url, attempt]);

  const handlePrint = useCallback(() => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.print();
  }, []);

  const handleDownload = useCallback(() => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = title.endsWith(".pdf") ? title : `${title}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [blobUrl, title]);

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
              disabled={!blobUrl}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-black hover:bg-white/20 disabled:opacity-40"
            >
              <Download className="h-4 w-4" aria-hidden />
              {t("common.download")}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!blobUrl}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-black hover:bg-white/20 disabled:opacity-40"
            >
              <Printer className="h-4 w-4" aria-hidden />
              {t("common.print")}
            </button>
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
          {loading ? (
            <p className="flex h-full min-h-[60vh] items-center justify-center text-sm font-bold text-white">
              {t("pdfModal.loading")}
            </p>
          ) : null}
          {failed ? (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-base font-black text-white">{t("pdfModal.unavailable")}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="h-9 rounded-lg bg-white px-4 text-xs font-black text-slate-900"
                >
                  {t("pdfModal.retry")}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-lg border border-white/30 px-4 text-xs font-black text-white"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          ) : null}
          {blobUrl ? (
            <iframe
              ref={iframeRef}
              title={title}
              src={blobUrl}
              className="h-full min-h-[60vh] w-full bg-white"
              onLoad={() => {
                if (!autoPrint || printedRef.current) return;
                printedRef.current = true;
                iframeRef.current?.contentWindow?.print();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
