"use client";

import { CheckCircle2, FileText, ScanLine, Upload, X } from "lucide-react";
import { ScanLoadingPanel } from "@/components/scan/scan-loading-panel";
import {
  SCAN_STATUS_MESSAGE_KEYS,
  useScanRotatingMessage,
} from "@/components/scan/use-scan-rotating-message";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { fetchScanWithProgress, fetchPdfPageCount } from "@/lib/document-scan/scan-fetch-client";
import { SCAN_ACCEPT_MIME, isPdfFile } from "@/lib/document-scan/upload-mime";
import {
  type ScanProgressPhase,
} from "@/lib/document-scan/scan-progress";
import type { ScannedZReportDto, ZReportScanFields } from "@/lib/document-scan/z-report-types";
import type { FieldConfidenceTier, ScannedField } from "@/lib/document-scan/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (doc: ScannedZReportDto) => void;
};

type Phase = "upload" | "preConfirm" | "scanning" | "review" | "confirm";

const ACCEPT = SCAN_ACCEPT_MIME;

type ScanApiPayload =
  | { success: true; ok: true; data: ScannedZReportDto; error?: string }
  | { success: false; ok?: false; error?: string; code?: string };

function resolveScanError(code: string | undefined, t: (k: string) => string): string {
  if (code === "SCAN_NOT_CONFIGURED" || code === "OCR_NOT_CONFIGURED") return t("scan.errorNotConfigured");
  if (code === "SCAN_PROVIDER_BUSY") return t("scan.errorAiBusy");
  if (code === "SCAN_TIMEOUT") return t("scan.errorScanTimeout");
  if (code === "FILE_TOO_LARGE") return t("scan.errorFileTooLarge");
  if (code === "SCAN_READ_FAILED" || code === "OCR_READ_FAILED") return t("scan.errorReadFailed");
  return t("scan.errorTryClearerImage");
}

const PROGRESS_LABEL_KEYS: Record<ScanProgressPhase, string> = {
  upload: "scan.progressUpload",
  preprocess: "scan.progressPreprocess",
  ai: "scan.progressAi",
  parse: "scan.progressParse",
};

function ConfidenceBadge({
  field,
  t,
}: {
  field: ScannedField<unknown>;
  t: (k: string) => string;
}) {
  if (!field.detected || field.confidencePercent == null) return null;
  const tier = field.confidence as FieldConfidenceTier;
  const color =
    tier === "high"
      ? "text-emerald-700 bg-emerald-50"
      : tier === "medium"
        ? "text-amber-700 bg-amber-50"
        : "text-slate-500 bg-slate-50";

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${color}`}>
      {tier === "high" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {field.confidencePercent}%
    </span>
  );
}

function FieldRow({
  label,
  field,
  t,
}: {
  label: string;
  field: ScannedField<unknown>;
  t: (k: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-2 last:border-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={field.detected ? "font-medium text-slate-900" : "text-slate-400"}>
          {field.display}
        </span>
        <ConfidenceBadge field={field} t={t} />
      </div>
    </div>
  );
}

export function ZReportScanDialog({ open, onClose, onApply }: Props) {
  if (!open) return null;
  return <ZReportScanDialogContent onClose={onClose} onApply={onApply} />;
}

function ZReportScanDialogContent({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (doc: ScannedZReportDto) => void;
}) {
  const { t, dir } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("upload");
  const [result, setResult] = useState<ScannedZReportDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressPhase | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setFileWithPreview = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setErrorMsg(null);
    setPhase("upload");
    setPdfPageCount(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    if (isPdfFile(f)) {
      void fetchPdfPageCount(f).then((count) => {
        setPdfPageCount(count);
      });
    }
  }, []);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFileWithPreview(f);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFileWithPreview(f);
  };

  const runScan = async () => {
    if (!file) return;
    setPhase("scanning");
    setErrorMsg(null);
    setScanProgress("upload");

    const form = new FormData();
    form.append("file", file);

    try {
      const streamed = await fetchScanWithProgress<ScannedZReportDto>({
        url: "/api/z-reports/scan",
        form,
        onProgress: setScanProgress,
      });

      if (!streamed.ok) {
        setErrorMsg(resolveScanError(streamed.code, t) || t("scan.errorScanFailed"));
        setPhase("upload");
        return;
      }

      const data = streamed.data;
      if (data.error === "SCAN_READ_FAILED" || data.error === "OCR_READ_FAILED") {
        setErrorMsg(t("scan.errorReadFailed"));
        setPhase("upload");
        return;
      }

      setResult(data);
      setPhase("review");
    } catch {
      setErrorMsg(t("scan.errorScanFailed"));
      setPhase("upload");
    } finally {
      setScanProgress(null);
    }
  };

  const fields = result?.scanFields;
  const canProceed = Boolean(result?.readyForConfirm);

  const handleApply = () => {
    if (!result) return;
    onApply(result);
    onClose();
  };

  const isPdf = file ? isPdfFile(file) : false;
  const isScanning = phase === "scanning";
  const rotatingSubtitle = useScanRotatingMessage(isScanning, [...SCAN_STATUS_MESSAGE_KEYS], t);
  const loadingTitle = t("scan.zReport.scanning");
  const loadingSubtitle = rotatingSubtitle || t("scan.zReport.scanningSubtitle");
  const progressLabels = {
    upload: t(PROGRESS_LABEL_KEYS.upload),
    preprocess: t(PROGRESS_LABEL_KEYS.preprocess),
    ai: t(PROGRESS_LABEL_KEYS.ai),
    parse: t(PROGRESS_LABEL_KEYS.parse),
  };

  const renderFields = (f: ZReportScanFields) => (
    <>
      <FieldRow label={t("register.zreport.numberLabel")} field={f.zNumber} t={t} />
      <FieldRow label={t("common.date")} field={f.date} t={t} />
      <FieldRow label={t("register.zreport.cashTaxable")} field={f.cashTaxable} t={t} />
      <FieldRow label={t("register.zreport.cashExempt")} field={f.cashExempt} t={t} />
      <FieldRow label={t("register.zreport.creditTaxable")} field={f.creditTaxable} t={t} />
      <FieldRow label={t("register.zreport.creditExempt")} field={f.creditExempt} t={t} />
      <FieldRow label={t("register.zreport.transfers")} field={f.transfers} t={t} />
      <FieldRow label={t("register.zreport.grandTotal")} field={f.grandTotal} t={t} />
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir={dir}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="z-report-scan-title"
      >
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 id="z-report-scan-title" className="text-lg font-semibold text-slate-900">
              {t("scan.zReport.title")}
            </h2>
            <p className="text-sm text-slate-500">{t("scan.zReport.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-2">
          <div className="order-first flex min-h-[240px] flex-col border-b bg-slate-50 md:border-b-0 md:border-s border-slate-200">
            <div className="border-b px-4 py-2 text-xs font-medium text-slate-500">
              {t("scan.sourceDocument")}
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              {!previewUrl ? (
                <div className="text-center text-sm text-slate-400">
                  <FileText className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  {t("scan.zReport.dropTitle")}
                </div>
              ) : isPdf ? (
                <iframe
                  src={previewUrl}
                  title={file?.name ?? "document"}
                  className="h-full min-h-[320px] w-full rounded border bg-white"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt={file?.name ?? "document"}
                  className="max-h-[420px] max-w-full rounded object-contain shadow-sm"
                />
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-auto p-5">
            {phase === "upload" && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center transition ${
                    dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                  <p className="font-medium text-slate-700">{t("scan.zReport.dropTitle")}</p>
                  <p className="mt-1 text-xs text-slate-500">{t("scan.acceptedFormats")}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    >
                      {t("scan.chooseFile")}
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={onFileChange}
                  />
                </div>

                {file ? <p className="mb-4 truncate text-sm text-slate-600">{file.name}</p> : null}

                {isPdf && pdfPageCount != null && pdfPageCount > 1 ? (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    {t("scan.pdfMultiPageWarning", { count: String(pdfPageCount) })}
                  </p>
                ) : null}

                {errorMsg ? (
                  <p className="mb-4 whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {errorMsg}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={!file}
                  onClick={() => setPhase("preConfirm")}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
                >
                  <ScanLine className="h-4 w-4" />
                  {t("scan.zReport.startScan")}
                </button>
              </>
            )}

            {phase === "preConfirm" && (
              <div className="flex flex-1 flex-col justify-center py-8">
                <div className="rounded-xl border bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900">{t("scan.zReport.confirmTitle")}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{t("scan.zReport.confirmBody")}</p>
                  <div className="mt-6 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPhase("upload")}
                      className="flex-1 rounded-lg border px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {t("scan.confirmCancel")}
                    </button>
                    <button
                      type="button"
                      onClick={runScan}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {t("scan.confirmApprove")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {phase === "scanning" && (
              <ScanLoadingPanel
                title={loadingTitle}
                subtitle={loadingSubtitle}
                scanProgress={scanProgress}
                progressLabels={progressLabels}
              />
            )}

            {phase === "review" && fields && (
              <>
                <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <div>
                    <p className="font-semibold">{t("scan.zReport.successTitle")}</p>
                    <p className="mt-0.5 text-emerald-700">{t("scan.zReport.successHint")}</p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border px-3">{renderFields(fields)}</div>

                {!canProceed ? (
                  <p className="mb-4 text-sm text-amber-700">{t("scan.errorEmpty")}</p>
                ) : null}

                <div className="mt-auto flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("upload");
                      setResult(null);
                    }}
                    className="flex-1 rounded-lg border px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {t("scan.rescan")}
                  </button>
                  <button
                    type="button"
                    disabled={!canProceed}
                    onClick={() => setPhase("confirm")}
                    className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {t("scan.continueToConfirm")}
                  </button>
                </div>
              </>
            )}

            {phase === "confirm" && fields && result && (
              <>
                <h3 className="mb-3 font-semibold text-slate-900">{t("scan.zReport.confirmSummaryTitle")}</h3>
                <div className="mb-4 space-y-1 rounded-lg border bg-slate-50 px-4 py-3 text-sm">
                  <p>
                    <span className="text-slate-500">{t("register.zreport.numberLabel")}: </span>
                    <span className="font-semibold">{fields.zNumber.display}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">{t("common.date")}: </span>
                    <span className="font-semibold">{fields.date.display}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">{t("scan.zReport.cashTotal")}: </span>
                    <span className="font-semibold">
                      {formatShekel(result.cashTotal)}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">{t("scan.zReport.creditTotal")}: </span>
                    <span className="font-semibold">
                      {formatShekel(result.creditTotal)}
                    </span>
                  </p>
                  <p>
                    <span className="text-slate-500">{t("register.zreport.grandTotal")}: </span>
                    <span className="font-semibold text-slate-900">
                      {formatShekel(result.grandTotal)}
                    </span>
                  </p>
                </div>
                <p className="mb-4 text-sm text-slate-600">{t("scan.zReport.confirmHint")}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPhase("review")}
                    className="flex-1 rounded-lg border px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {t("scan.confirmCancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    {t("scan.zReport.applyToForm")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatShekel(n: number): string {
  return `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
