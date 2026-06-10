"use client";



import { Paperclip, Loader2, FileText, AlertTriangle, ExternalLink } from "lucide-react";

import { useRef, useState, type ChangeEvent } from "react";

import { useI18n } from "@/components/i18n-provider";

import type { IncomeExpensePayload } from "@/lib/finance/document-payload";

import { parseApiJson } from "@/lib/api/parse-json-response";
import { SCAN_ACCEPT_MIME } from "@/lib/document-scan/upload-mime";

const ACCEPT = SCAN_ACCEPT_MIME;



type Props = {

  form: IncomeExpensePayload;

  onChange: (next: IncomeExpensePayload) => void;

  documentCategory: "income" | "expense";

  disabled?: boolean;

  showOcrBanner?: boolean;

  onClearOcrFlag?: () => void;

};



function hasAttachedReceipt(form: IncomeExpensePayload): boolean {

  return Boolean(form.receiptStoragePath?.trim() || form.receiptFileName?.trim());

}



async function fetchSignedViewUrl(params: {

  storagePath: string;

  storageBucket?: string | null;

  fileName?: string | null;

  fileType?: string | null;

}): Promise<string | null> {

  const q = new URLSearchParams({

    storagePath: params.storagePath,

  });

  if (params.storageBucket) q.set("storageBucket", params.storageBucket);

  if (params.fileName) q.set("fileName", params.fileName);

  if (params.fileType) q.set("fileType", params.fileType);



  const res = await fetch(`/api/source-documents/access?${q.toString()}`, {

    credentials: "same-origin",

  });

  const parsed = await parseApiJson<{ ok?: boolean; data?: { url: string }; error?: string }>(res);

  return parsed.ok && parsed.data?.url ? parsed.data.url : null;

}



export function RegisterReceiptPanel({

  form,

  onChange,

  documentCategory,

  disabled,

  showOcrBanner,

  onClearOcrFlag,

}: Props) {

  const { t } = useI18n();

  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);

  const [opening, setOpening] = useState(false);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const [viewError, setViewError] = useState<string | null>(null);



  const attachFile = async (file: File | undefined) => {

    if (!file || disabled) return;

    setUploading(true);

    setUploadError(null);

    try {

      const fd = new FormData();

      fd.append("file", file);

      fd.append("category", documentCategory);

      const res = await fetch("/api/source-documents/upload", {

        method: "POST",

        body: fd,

        credentials: "same-origin",

      });

      const parsed = await parseApiJson<{

        ok?: boolean;

        data?: {

          fileName: string;

          fileType: string;

          storageBucket: string;

          storagePath: string;

          viewUrl: string | null;

        };

        error?: string;

      }>(res);

      if (!parsed.ok || !parsed.data) {

        setUploadError(parsed.error ?? t("scan.attachError"));

        return;

      }

      onChange({

        ...form,

        receiptFileUrl: parsed.data.viewUrl,

        receiptFileName: parsed.data.fileName,

        receiptStoragePath: parsed.data.storagePath,

        receiptStorageBucket: parsed.data.storageBucket,

        receiptMimeType: parsed.data.fileType,

        ocrAutoFilled: false,

      });

    } catch {

      setUploadError(t("scan.attachError"));

    } finally {

      setUploading(false);

    }

  };



  const onFilePick = (e: ChangeEvent<HTMLInputElement>) => {

    void attachFile(e.target.files?.[0]);

    e.target.value = "";

  };



  const clearReceipt = () => {

    onChange({

      ...form,

      receiptFileUrl: null,

      receiptFileName: null,

      receiptStoragePath: null,

      receiptStorageBucket: null,

      receiptMimeType: null,

      ocrAutoFilled: false,

    });

    onClearOcrFlag?.();

  };



  const openSourceDocument = async () => {

    const storagePath = form.receiptStoragePath?.trim();

    if (!storagePath) return;



    setOpening(true);

    setViewError(null);

    try {

      let url = form.receiptFileUrl?.trim() || null;

      if (!url) {

        url = await fetchSignedViewUrl({

          storagePath,

          storageBucket: form.receiptStorageBucket,

          fileName: form.receiptFileName,

          fileType: form.receiptMimeType,

        });

      }

      if (!url) {

        setViewError(t("scan.viewSourceError"));

        return;

      }

      window.open(url, "_blank", "noopener,noreferrer");

    } catch {

      setViewError(t("scan.viewSourceError"));

    } finally {

      setOpening(false);

    }

  };



  return (

    <div className="space-y-2">

      {showOcrBanner ? (

        <div

          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"

          role="status"

        >

          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />

          <span>{t("scan.autoFillBanner")}</span>

        </div>

      ) : null}



      {hasAttachedReceipt(form) ? (

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">

          <span className="inline-flex items-center gap-2 font-bold">

            <FileText className="h-4 w-4" aria-hidden />

            {form.receiptFileName || t("scan.sourceDocument")}

          </span>

          <div className="flex flex-wrap items-center gap-2">

            <button

              type="button"

              disabled={disabled || opening || !form.receiptStoragePath}

              onClick={() => void openSourceDocument()}

              className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"

            >

              {opening ? (

                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />

              ) : (

                <ExternalLink className="h-3 w-3" aria-hidden />

              )}

              {t("scan.viewSourceDocument")}

            </button>

            <button

              type="button"

              disabled={disabled}

              onClick={clearReceipt}

              className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"

            >

              {t("scan.removeReceipt")}

            </button>

          </div>

        </div>

      ) : (

        <div className="flex flex-wrap items-center gap-2">

          <button

            type="button"

            disabled={disabled || uploading}

            onClick={() => inputRef.current?.click()}

            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"

          >

            {uploading ? (

              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />

            ) : (

              <Paperclip className="h-3.5 w-3.5" aria-hidden />

            )}

            {t("scan.attachOptional")}

          </button>

          <span className="text-[11px] text-slate-500">{t("scan.acceptedFormats")}</span>

        </div>

      )}



      {uploadError ? (

        <p className="text-xs font-semibold text-rose-700" role="alert">

          {uploadError}

        </p>

      ) : null}



      {viewError ? (

        <p className="text-xs font-semibold text-rose-700" role="alert">

          {viewError}

        </p>

      ) : null}



      <input

        ref={inputRef}

        type="file"

        accept={ACCEPT}

        onChange={onFilePick}

        className="hidden"

        aria-hidden

      />

    </div>

  );

}

