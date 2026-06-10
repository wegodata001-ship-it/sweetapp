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
import type { DocumentScanFields, FieldConfidenceTier, ScannedField } from "@/lib/document-scan/types";
import { ScanItemPriceCompareRow, ScanPriceCompareSummary } from "@/components/scan/scan-price-compare-ui";
import { ScanSupplierPanel } from "@/components/scan-supplier-panel";

export type ScannedItemDto = {
  rawName: string;
  name: string;
  productId?: string | null;
  supplierProductId?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  confidenceScore?: number;
  regularPrice?: number | null;
  regularPriceSamples?: number;
  priceFlagKey?: "higher" | "lower" | "match" | null;
  priceCompareStatus?: "new" | "unchanged" | "increased" | "decreased";
  priceDeltaAmount?: number | null;
  priceDeltaPercent?: number | null;
};

export type ScannedDocumentDto = {
  supplierRawName: string;
  supplierName: string;
  supplierId?: string | null;
  suggestNewSupplier?: boolean;
  invoiceNumber: string;
  date: string;
  documentType?: string;
  invoiceKind?: "expense" | "credit";
  vatAmount?: number | null;
  total?: number | null;
  items: ScannedItemDto[];
  priceCompareSummary?: {
    unchanged: number;
    newItems: number;
    increased: number;
    decreased: number;
    total: number;
  };
  rawText: string;
  receiptFileUrl?: string | null;
  receiptFileName?: string | null;
  receiptStoragePath?: string | null;
  receiptStorageBucket?: string | null;
  receiptMimeType?: string | null;
  engine: string;
  confidence: number;
  error?: string;
  partial?: boolean;
  scanFields?: DocumentScanFields;
  readyForConfirm?: boolean;
  fromAiCache?: boolean;
  fieldConfidence?: {
    supplier?: number;
    invoiceNumber?: number;
    date?: number;
    total?: number;
  };
};

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (doc: ScannedDocumentDto) => void;
  /** expense | income — הודעות הצלחה מותאמות */
  documentKind?: "expense" | "income";
};

type Phase = "upload" | "preConfirm" | "scanning" | "review" | "confirm";
type IntakeMode = "quick" | "full";

const ACCEPT = SCAN_ACCEPT_MIME;

type ScanApiPayload =
  | { success: true; ok: true; data: ScannedDocumentDto; error?: string; partial?: boolean }
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

function confidenceLabel(tier: FieldConfidenceTier, t: (k: string) => string): string {
  if (tier === "high") return t("scan.confidenceHigh");
  if (tier === "medium") return t("scan.confidenceMedium");
  if (tier === "low") return t("scan.confidenceLow");
  return "";
}

function ConfidenceBadge({
  field,
  t,
}: {
  field: ScannedField<unknown>;
  t: (k: string) => string;
}) {
  if (!field.detected || field.confidencePercent == null) return null;
  const tier = field.confidence;
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
      <span className="sr-only">{confidenceLabel(tier, t)}</span>
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

export function DocumentScanDialog({ open, onClose, onApply, documentKind = "expense" }: Props) {
  if (!open) return null;
  return (
    <DocumentScanDialogContent onClose={onClose} onApply={onApply} documentKind={documentKind} />
  );
}

/** @deprecated use DocumentScanDialog */
export const ExpenseScanDialog = DocumentScanDialog;

function DocumentScanDialogContent({
  onClose,
  onApply,
  documentKind,
}: {
  onClose: () => void;
  onApply: (doc: ScannedDocumentDto) => void;
  documentKind: "expense" | "income";
}) {
  const { t, dir } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("upload");
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("quick");
  const [result, setResult] = useState<ScannedDocumentDto | null>(null);
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
    form.append("intakeMode", intakeMode);
    form.append("documentKind", documentKind);

    try {
      const streamed = await fetchScanWithProgress<ScannedDocumentDto>({
        url: "/api/expenses/scan",
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
  const canProceed = Boolean(
    result?.readyForConfirm ||
      (fields &&
        (fields.supplier.detected || fields.date.detected || fields.total.detected)),
  );

  const handleApply = () => {
    if (!result) return;
    const payload =
      intakeMode === "quick" && documentKind !== "expense"
        ? { ...result, items: [] }
        : result;
    onApply(payload);
    onClose();
  };

  const handleSupplierLinked = useCallback(
    async (supplier: { id: string; name: string }) => {
      if (!result) return;
      setResult((prev) =>
        prev
          ? {
              ...prev,
              supplierId: supplier.id,
              supplierName: supplier.name,
              suggestNewSupplier: false,
            }
          : prev,
      );
      if (documentKind !== "expense" || result.items.length === 0) return;
      try {
        const res = await fetch("/api/expenses/scan/price-compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            supplierId: supplier.id,
            supplierName: supplier.name,
            items: result.items,
          }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          data?: { items: ScannedItemDto[]; priceCompareSummary?: ScannedDocumentDto["priceCompareSummary"] };
        };
        if (json.ok && json.data) {
          setResult((prev) =>
            prev
              ? {
                  ...prev,
                  supplierId: supplier.id,
                  supplierName: supplier.name,
                  items: json.data!.items,
                  priceCompareSummary: json.data!.priceCompareSummary,
                  suggestNewSupplier: false,
                }
              : prev,
          );
        }
      } catch {
        /* keep supplier link without price compare refresh */
      }
    },
    [documentKind, result],
  );

  const isPdf = file ? isPdfFile(file) : false;
  const isScanning = phase === "scanning";
  const rotatingSubtitle = useScanRotatingMessage(isScanning, [...SCAN_STATUS_MESSAGE_KEYS], t);
  const loadingTitle = t("scan.scanning");
  const loadingSubtitle = rotatingSubtitle || t("scan.scanningAltSubtitle");
  const successTitleKey =
    documentKind === "income" ? "scan.successIncomeTitle" : "scan.successExpenseTitle";
  const successHintKey =
    documentKind === "income" ? "scan.successIncomeHint" : "scan.successExpenseHint";
  const progressLabels = {
    upload: t(PROGRESS_LABEL_KEYS.upload),
    preprocess: t(PROGRESS_LABEL_KEYS.preprocess),
    ai: t(PROGRESS_LABEL_KEYS.ai),
    parse: t(PROGRESS_LABEL_KEYS.parse),
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" dir={dir}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-scan-title"
      >
        <header className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 id="document-scan-title" className="text-lg font-semibold text-slate-900">
              {t("scan.title")}
            </h2>
            <p className="text-sm text-slate-500">{t("scan.previewHint")}</p>
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
          {/* תצוגת מסמך — בצד ימין ב-RTL */}
          <div className="order-first flex min-h-[240px] flex-col border-b bg-slate-50 md:order-first md:border-b-0 md:border-s border-slate-200">
            <div className="border-b px-4 py-2 text-xs font-medium text-slate-500">
              {t("scan.sourceDocument")}
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              {!previewUrl ? (
                <div className="text-center text-sm text-slate-400">
                  <FileText className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  {t("scan.dropTitle")}
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

          {/* שליטה ושדות */}
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
                  <p className="font-medium text-slate-700">{t("scan.dropTitle")}</p>
                  <p className="mt-1 text-xs text-slate-500">{t("scan.acceptedFormats")}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    >
                      {t("scan.chooseFile")}
                    </button>
                    {file ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setPdfPageCount(null);
                          setPreviewUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                        }}
                        className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        {t("scan.replaceFile")}
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={onFileChange}
                  />
                </div>

                {file ? (
                  <p className="mb-4 truncate text-sm text-slate-600">{file.name}</p>
                ) : null}

                {isPdf && pdfPageCount != null && pdfPageCount > 1 ? (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    {t("scan.pdfMultiPageWarning", { count: String(pdfPageCount) })}
                  </p>
                ) : null}

                <div className="mb-4 rounded-lg bg-slate-100 p-1">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setIntakeMode("quick")}
                      className={`rounded-md px-3 py-2 text-sm ${
                        intakeMode === "quick" ? "bg-white font-medium shadow-sm" : "text-slate-600"
                      }`}
                    >
                      {t("scan.intakeQuick")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntakeMode("full")}
                      className={`rounded-md px-3 py-2 text-sm ${
                        intakeMode === "full" ? "bg-white font-medium shadow-sm" : "text-slate-600"
                      }`}
                    >
                      {t("scan.intakeFull")}
                    </button>
                  </div>
                  <p className="mt-2 px-2 text-xs text-slate-500">
                    {intakeMode === "quick" ? t("scan.intakeQuickHint") : t("scan.intakeFullHint")}
                  </p>
                </div>

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
                  {t("scan.startScan")}
                </button>
              </>
            )}

            {phase === "preConfirm" && (
              <div className="flex flex-1 flex-col justify-center py-8">
                <div className="rounded-xl border bg-white p-5 shadow-sm">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    <ScanLine className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{t("scan.confirmTitle")}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                    {t("scan.confirmBody")}
                  </p>
                  <p className="mt-4 font-medium text-slate-800">{t("scan.confirmQuestion")}</p>
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
                {result?.fromAiCache ? (
                  <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    {t("scan.fromAiCache")}
                  </div>
                ) : null}
                <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <div>
                    <p className="font-semibold">{t(successTitleKey)}</p>
                    <p className="mt-0.5 text-emerald-700">{t(successHintKey)}</p>
                  </div>
                </div>

                <div className="mb-4 flex gap-2 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setIntakeMode("quick")}
                    className={`flex-1 rounded-md px-3 py-2 text-sm ${
                      intakeMode === "quick" ? "bg-white font-medium shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {t("scan.intakeQuick")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntakeMode("full")}
                    className={`flex-1 rounded-md px-3 py-2 text-sm ${
                      intakeMode === "full" ? "bg-white font-medium shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {t("scan.intakeFull")}
                  </button>
                </div>

                {documentKind === "expense" &&
                result?.suggestNewSupplier &&
                !result.supplierId &&
                (result.supplierRawName || fields.supplier.value) ? (
                  <div className="mb-4">
                    <ScanSupplierPanel
                      ocrName={result.supplierRawName || fields.supplier.value || ""}
                      onLinked={(s) => void handleSupplierLinked(s)}
                    />
                  </div>
                ) : null}

                {documentKind === "expense" && result?.supplierId && result.priceCompareSummary ? (
                  <ScanPriceCompareSummary summary={result.priceCompareSummary} />
                ) : null}

                <div className="mb-4 rounded-lg border px-3">
                  <FieldRow label={t("scan.fields.supplier")} field={fields.supplier} t={t} />
                  <FieldRow label={t("scan.fields.date")} field={fields.date} t={t} />
                  <FieldRow label={t("scan.fields.invoiceNumber")} field={fields.invoiceNumber} t={t} />
                  <FieldRow label={t("scan.fields.subtotal")} field={fields.subtotal} t={t} />
                  <FieldRow label={t("scan.fields.vat")} field={fields.vat} t={t} />
                  <FieldRow label={t("scan.total")} field={fields.total} t={t} />
                  <FieldRow label={t("scan.fields.vatId")} field={fields.vatId} t={t} />
                  {intakeMode === "full" ? (
                    <FieldRow label={t("scan.fields.documentType")} field={fields.documentType} t={t} />
                  ) : null}
                </div>

                {intakeMode === "full" || (documentKind === "expense" && (result?.items.length ?? 0) > 0) ? (
                  <div className="mb-4 rounded-lg border">
                    <div className="border-b px-3 py-2 text-sm font-medium text-slate-700">
                      {t("scan.itemsTitle").replace("{{count}}", String(result?.items.length ?? 0))}
                    </div>
                    {result?.items.length ? (
                      <div className="divide-y">
                        {result.items.map((item, idx) => (
                          <div key={`${item.name}-${idx}`} className="px-3 py-2 text-sm">
                            <div className="font-medium text-slate-900">{item.name || item.rawName}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {t("scan.itemQuantity")}: {item.quantity} · {t("scan.itemUnitPrice")}:{" "}
                              {item.unitPrice.toLocaleString("he-IL", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              · {t("scan.itemLineTotal")}:{" "}
                              {item.lineTotal.toLocaleString("he-IL", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                            {documentKind === "expense" ? (
                              <ScanItemPriceCompareRow item={item} />
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-3 text-sm text-slate-500">{t("scan.noItems")}</p>
                    )}
                  </div>
                ) : null}

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
                <h3 className="mb-3 font-semibold text-slate-900">{t("scan.confirmFoundTitle")}</h3>
                <div className="mb-6 space-y-2 rounded-lg border bg-slate-50 px-4 py-3 text-sm">
                  <FieldRow label={t("scan.fields.supplier")} field={fields.supplier} t={t} />
                  <FieldRow label={t("scan.fields.date")} field={fields.date} t={t} />
                  <FieldRow label={t("scan.fields.invoiceNumber")} field={fields.invoiceNumber} t={t} />
                  <FieldRow label={t("scan.total")} field={fields.total} t={t} />
                  {fields.vat.detected ? (
                    <FieldRow label={t("scan.fields.vat")} field={fields.vat} t={t} />
                  ) : null}
                </div>
                {documentKind === "expense" && result.priceCompareSummary ? (
                  <ScanPriceCompareSummary summary={result.priceCompareSummary} />
                ) : null}
                <p className="mb-4 text-sm text-slate-600">
                  {documentKind === "expense"
                    ? t("scan.confirmFoundHintExpense")
                    : t("scan.confirmFoundHint")}
                </p>
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
                    {documentKind === "expense" ? t("scan.saveExpense") : t("scan.createIncome")}
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
