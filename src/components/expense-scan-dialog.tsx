"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  ScanLine,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useI18n } from "@/components/i18n-provider";
import { ScanSupplierPanel } from "@/components/scan-supplier-panel";
import { parseApiJson } from "@/lib/api/parse-json-response";
import {
  confidenceBadgeClass,
  confidenceItemBorderClass,
  confidenceTier,
} from "@/lib/ocr/confidence-ui";
import { formatShekel } from "@/lib/format-shekel";

type ScanDebugDto = {
  provider: string;
  confidence: number;
  textLength: number;
  itemsFound: number;
  parseDurationMs: number;
  ocrEngine?: string;
  ocrLanguage?: string;
  ocrEngineNumber?: string;
  fromCache?: boolean;
  partial?: boolean;
  totalSuspect?: boolean;
  itemsSumDetected?: number;
  pdfPageCount?: number;
  overlayLineCount?: number;
  parseSource?: string;
  invoiceKind?: "expense" | "credit";
  needsReviewFields?: string[];
  headerFound?: boolean;
  columnBands?: { kind: string; minX: number; maxX: number; centerX: number }[];
  overlayLinesPreview?: { text: string; top: number; wordCount: number }[];
  blockCount?: number;
  detectedLanguages?: string[];
  needsManualReview?: boolean;
  rawOcrPreview?: string;
  garbageRatio?: number;
  ocrProviderActive?: "google_vision" | "ocr_space";
  ocrConfidence?: number;
  pageCount?: number;
  visionWordsSample?: { text: string; x: number; y: number }[];
  layoutOnlyMode?: boolean;
  firstOverlayLines?: string[];
};

type ScanApiPayload =
  | {
      success: true;
      ok: true;
      data: ScannedDocumentDto;
      provider?: string;
      debug?: ScanDebugDto;
    }
  | {
      success: false;
      ok?: false;
      error?: string;
      code?: string;
      provider?: string;
    };

function resolveScanErrorMessages(
  code: string | undefined,
  error: string | undefined,
  t: (key: string) => string,
): string {
  const lines: string[] = [t("scan.errorScanFailed")];
  switch (code) {
    case "FILE_TOO_LARGE":
      lines.push(t("scan.errorFileTooLarge"));
      break;
    case "OCR_TIMEOUT":
    case "OCR_PROVIDER_ERROR":
      lines.push(t("scan.errorOcrTemporary"));
      break;
    case "OCR_NOT_CONFIGURED":
      return t("scan.errorNotConfigured");
    case "OCR_READ_FAILED":
      lines.push(t("scan.errorTryClearerImage"));
      break;
    default:
      lines.push(t("scan.errorTryClearerImage"));
      if (error && !error.includes("Unexpected token")) {
        lines.push(error);
      }
  }
  return lines.join("\n");
}

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
  parseConfidence?: number;
  lineStatus?: "valid" | "review" | "suspect";
  ocrSuspect?: boolean;
  uncertain?: boolean;
  regularPrice?: number | null;
  regularPriceSamples?: number;
  isHigher?: boolean;
  isLower?: boolean;
  priceFlagKey?: "higher" | "lower" | "match" | null;
  priceDifferencePercent?: number | null;
  suggestedProductId?: string | null;
  suggestedProductName?: string | null;
  productMatchScore?: number | null;
};

export type ScannedDocumentDto = {
  supplierRawName: string;
  supplierName: string;
  supplierId?: string | null;
  suggestNewSupplier?: boolean;
  suggestedSupplierId?: string | null;
  suggestedSupplierName?: string | null;
  supplierMatchScore?: number | null;
  ocrFromCache?: boolean;
  invoiceNumber: string;
  date: string;
  documentType?: string;
  invoiceKind?: "expense" | "credit";
  needsReviewFields?: string[];
  fieldConfidence?: {
    supplier?: number;
    invoiceNumber?: number;
    date?: number;
    total?: number;
  };
  vatAmount?: number | null;
  total?: number | null;
  totalSuspect?: boolean;
  itemsSumDetected?: number;
  items: ScannedItemDto[];
  rawText: string;
  receiptFileUrl?: string | null;
  receiptFileName?: string | null;
  engine: string;
  confidence: number;
  skippedLinesCount?: number;
  time?: string;
  error?: string;
  partial?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (doc: ScannedDocumentDto) => void;
};

const ACCEPT = "image/jpeg,image/jpg,image/png,application/pdf";

/**
 * Outer wrapper that mounts the inner dialog component only while open=true.
 * This lets the inner component own its scan state and reset it naturally
 * by unmounting (no setState-in-effect anti-pattern).
 */
export function ExpenseScanDialog({ open, onClose, onApply }: Props) {
  if (!open) return null;
  return <ExpenseScanDialogContent onClose={onClose} onApply={onApply} />;
}

function ExpenseScanDialogContent({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (doc: ScannedDocumentDto) => void;
}) {
  const { t, dir, bcp47 } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScannedDocumentDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanDebug, setScanDebug] = useState<ScanDebugDto | null>(null);
  const [showOcrDebug, setShowOcrDebug] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Revoke the preview blob URL on unmount to avoid leaking memory.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showOcrDebug) setShowOcrDebug(false);
        else close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, showOcrDebug]);

  useEffect(() => {
    if (!scanning) {
      setScanStep(0);
      return;
    }
    const delays = [0, 900, 2200, 3800, 5200, 6800];
    const timers = delays.map((ms, i) => window.setTimeout(() => setScanStep(i), ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [scanning]);

  const acceptFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
      setResult(null);
      setScanDebug(null);
      setPdfPageCount(null);
      setErrorMsg(null);
    },
    [previewUrl],
  );

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);

  const startScan = async () => {
    if (!file) return;
    setScanning(true);
    setErrorMsg(null);
    setScanDebug(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/expenses/scan", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const parsed = await parseApiJson<ScanApiPayload>(res);
      if (!parsed.ok) {
        setErrorMsg(
          resolveScanErrorMessages(undefined, parsed.error, t) ||
            t("scan.errorGeneric"),
        );
        return;
      }
      const json = parsed.data;
      if ("success" in json && json.success === false) {
        const base =
          resolveScanErrorMessages(json.code, json.error, t) ||
          json.error ||
          t("scan.errorGeneric");
        setErrorMsg(result ? `${base}\n${t("scan.errorPartial")}` : base);
        return;
      }
      if (!("data" in json) || !json.data) {
        setErrorMsg(t("scan.errorGeneric"));
        return;
      }
      setResult(json.data);
      setScanDebug(json.debug ?? null);
      if (json.debug?.pdfPageCount && json.debug.pdfPageCount > 1) {
        setPdfPageCount(json.debug.pdfPageCount);
      }
      const hasPartial =
        Boolean(json.data.supplierName || json.data.supplierRawName) ||
        Boolean(json.data.total) ||
        Boolean(json.data.date) ||
        Boolean(json.data.invoiceNumber) ||
        json.data.items.length > 0;
      if (json.data.error === "OCR_READ_FAILED") {
        setErrorMsg(
          hasPartial
            ? t("scan.errorPartial")
            : resolveScanErrorMessages("OCR_READ_FAILED", undefined, t),
        );
      } else if (json.data.error === "OCR_NOT_CONFIGURED") {
        setErrorMsg(t("scan.errorNotConfigured"));
      } else if (json.data.partial || json.data.error === "OCR_PARTIAL") {
        setErrorMsg(t("scan.partialHint"));
      } else if (json.data.error) {
        setErrorMsg(t("scan.errorPartial"));
      } else if (
        json.data.items.length === 0 &&
        !json.data.total &&
        !json.data.supplierName
      ) {
        setErrorMsg(t("scan.errorEmpty"));
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : t("scan.errorGeneric"));
    } finally {
      setScanning(false);
    }
  };

  const updateField = <K extends keyof ScannedDocumentDto>(
    key: K,
    value: ScannedDocumentDto[K],
  ) => {
    setResult((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateItem = (
    idx: number,
    patch: Partial<ScannedItemDto>,
  ) => {
    setResult((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((it, i) =>
        i === idx
          ? {
              ...it,
              ...patch,
              lineTotal:
                patch.quantity !== undefined || patch.unitPrice !== undefined
                  ? (patch.quantity ?? it.quantity) *
                    (patch.unitPrice ?? it.unitPrice)
                  : it.lineTotal,
            }
          : it,
      );
      return { ...prev, items };
    });
  };

  const removeItem = (idx: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== idx) };
    });
  };

  const linkSuggestedSupplier = async () => {
    if (!result?.suggestedSupplierId || !result.suggestedSupplierName) return;
    const ocrName = result.supplierRawName || result.supplierName;
    try {
      const res = await fetch("/api/ocr/supplier-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          supplierId: result.suggestedSupplierId,
          ocrName,
        }),
      });
      const json = (await res.json()) as { ok: boolean };
      if (!json.ok) return;
      setResult((prev) =>
        prev
          ? {
              ...prev,
              supplierId: prev.suggestedSupplierId,
              supplierName: prev.suggestedSupplierName!,
              suggestNewSupplier: false,
              suggestedSupplierId: null,
              suggestedSupplierName: null,
            }
          : prev,
      );
    } catch {
      /* ignore */
    }
  };

  const addBlankItem = () => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            rawName: "",
            name: "",
            quantity: 1,
            unitPrice: 0,
            lineTotal: 0,
            regularPrice: null,
            regularPriceSamples: 0,
            isHigher: false,
            isLower: false,
            priceFlagKey: null,
          },
        ],
      };
    });
  };

  const isImage = file && file.type.startsWith("image/");
  const isPdf = file && file.type === "application/pdf";

  const grandTotal = useMemo(() => {
    if (!result) return 0;
    if (result.total && result.total > 0) return result.total;
    return result.items.reduce((s, i) => s + (i.lineTotal || 0), 0);
  }, [result]);

  return (
    <div
      dir={dir}
      className="fixed inset-0 z-[100] flex items-stretch bg-black/70 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-scan-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="m-0 flex w-full max-w-[1280px] flex-col self-stretch overflow-hidden bg-white shadow-2xl md:m-4 md:max-h-[calc(100vh-2rem)] md:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-rose-50 via-amber-50 to-white px-4 py-3">
          <h2
            id="expense-scan-title"
            className="flex items-center gap-2 text-base font-black text-slate-900 md:text-lg"
          >
            <ScanLine className="h-5 w-5 text-rose-600" aria-hidden />
            {t("scan.title")}
          </h2>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-700 hover:bg-slate-200"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
            {t("common.close")}
          </button>
        </div>

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-2">
          {/* Left: upload + preview */}
          <div className="flex min-h-0 flex-col gap-3 overflow-auto border-b border-slate-200 p-4 md:border-b-0 md:border-l md:border-slate-200">
            {!file && (
              <div
                className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-slate-50 px-5 py-10 text-center transition ${
                  dragOver
                    ? "border-rose-400 bg-rose-50"
                    : "border-slate-300 hover:border-slate-400"
                }`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
              >
                <ScanLine className="h-10 w-10 text-rose-500" aria-hidden />
                <p className="text-base font-black text-slate-800">
                  {t("scan.dropTitle")}
                </p>
                <p className="text-sm text-slate-500">{t("scan.dropSubtitle")}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700"
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                    {t("scan.chooseFile")}
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 md:hidden"
                  >
                    <Camera className="h-4 w-4" aria-hidden />
                    {t("scan.useCamera")}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t("scan.acceptedFormats")}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={onFileInput}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFileInput}
                  className="hidden"
                />
              </div>
            )}

            {file && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-800">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024).toLocaleString(bcp47, {
                        maximumFractionDigits: 0,
                      })}{" "}
                      KB · {file.type}
                    </p>
                    {pdfPageCount != null && pdfPageCount > 1 ? (
                      <p className="mt-1 text-xs font-bold text-amber-800">
                        {t("scan.pdfMultiPageWarning", { count: pdfPageCount })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {t("scan.replaceFile")}
                    </button>
                    {!scanning && !result && (
                      <button
                        type="button"
                        onClick={() => void startScan()}
                        className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-black text-white shadow-sm hover:bg-rose-700"
                      >
                        <ScanLine className="h-4 w-4" aria-hidden />
                        {t("scan.startScan")}
                      </button>
                    )}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={onFileInput}
                  className="hidden"
                />

                <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {isImage && previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt={file.name}
                      className="h-full max-h-[60vh] w-full object-contain"
                    />
                  ) : isPdf && previewUrl ? (
                    <iframe
                      title={file.name}
                      src={previewUrl}
                      className="h-full min-h-[60vh] w-full bg-white"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6">
                      <FileText className="h-10 w-10 text-slate-400" aria-hidden />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: parsed data */}
          <div className="flex min-h-0 flex-col overflow-auto p-4">
            {scanning && !result && <ScanLoadingPanel step={scanStep} t={t} />}

            {!scanning && !result && !errorMsg && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <FileText className="h-8 w-8 text-slate-400" aria-hidden />
                <p className="text-sm font-bold text-slate-600">
                  {t("scan.previewHint")}
                </p>
              </div>
            )}

            {errorMsg && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
                <span className="flex-1 whitespace-pre-wrap">{errorMsg}</span>
              </div>
            )}

            {scanning && result ? (
              <div className="mb-3">
                <ScanLoadingPanel step={scanStep} t={t} />
              </div>
            ) : null}

            {result && (
              <div
                className={`flex flex-col gap-3 ${scanning ? "pointer-events-none opacity-50" : ""}`}
              >
                {(() => {
                  const docTier = confidenceTier(result.confidence);
                  const tierKey =
                    docTier === "high"
                      ? "scan.confidenceHigh"
                      : docTier === "medium"
                        ? "scan.confidenceMedium"
                        : "scan.confidenceLow";
                  return (
                    <div
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-black ${confidenceBadgeClass(docTier)}`}
                    >
                      <span>{t("scan.confidenceLabel")}</span>
                      <span>{t(tierKey)}</span>
                    </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOcrDebug(true)}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {t("scan.showRawOcr")}
                  </button>
                  {result.ocrFromCache ? (
                    <span className="text-[11px] font-bold text-slate-500">
                      {t("scan.ocrFromCache")}
                    </span>
                  ) : null}
                </div>
                {result.invoiceKind === "credit" ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-bold text-violet-900">
                    חשבונית זיכוי — יש לוודא סוג המסמך לפני הרישום
                  </div>
                ) : null}
                {(result.needsReviewFields?.length ?? 0) > 0 ? (
                  <div
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${confidenceBadgeClass("medium")}`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>דורש אימות: {result.needsReviewFields?.join(" · ")}</span>
                  </div>
                ) : null}
                {result.totalSuspect ? (
                  <div
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${confidenceBadgeClass("low")}`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{t("scan.totalSuspectWarning")}</span>
                  </div>
                ) : null}
                {result.suggestedSupplierName &&
                !result.supplierId &&
                (result.supplierMatchScore ?? 0) >= 0.52 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-950">
                    <span>
                      {t("scan.supplierDidYouMean", {
                        name: result.suggestedSupplierName,
                        percent: Math.round((result.supplierMatchScore ?? 0) * 100),
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => void linkSuggestedSupplier()}
                      className="rounded-lg bg-sky-700 px-3 py-1 text-xs font-black text-white hover:bg-sky-800"
                    >
                      {t("scan.linkSuggestedSupplier")}
                    </button>
                  </div>
                ) : null}
                {result.suggestNewSupplier && !result.supplierId ? (
                  <ScanSupplierPanel
                    ocrName={result.supplierRawName || result.supplierName}
                    onLinked={(s) => {
                      setResult((prev) =>
                        prev
                          ? {
                              ...prev,
                              supplierId: s.id,
                              supplierName: s.name,
                              suggestNewSupplier: false,
                            }
                          : prev,
                      );
                    }}
                  />
                ) : result.supplierId ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                    {t("scan.supplierMatched", { name: result.supplierName })}
                  </div>
                ) : null}

                <section className="overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-start">{t("scan.previewTable.field")}</th>
                        <th className="px-3 py-2 text-start">{t("scan.previewTable.value")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <PreviewRow label={t("scan.fields.supplier")} value={result.supplierName} />
                      <PreviewRow label={t("scan.fields.date")} value={result.date || "—"} />
                      <PreviewRow
                        label={t("scan.fields.invoiceNumber")}
                        value={result.invoiceNumber || "—"}
                      />
                      <PreviewRow
                        label={t("scan.total")}
                        value={formatShekel(grandTotal)}
                        highlight={result.totalSuspect}
                        highlightClass={
                          result.totalSuspect
                            ? "text-base font-black tabular-nums text-amber-800"
                            : undefined
                        }
                      />
                    </tbody>
                  </table>
                </section>

                <section className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[13px] font-bold text-slate-700">
                    {t("scan.fields.supplier")}
                    <input
                      type="text"
                      value={result.supplierName}
                      onChange={(e) => updateField("supplierName", e.target.value)}
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                    />
                  </label>
                  <label className="block text-[13px] font-bold text-slate-700">
                    {t("scan.fields.date")}
                    <input
                      type="date"
                      value={result.date || ""}
                      onChange={(e) => updateField("date", e.target.value)}
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                    />
                  </label>
                  <label className="block text-[13px] font-bold text-slate-700">
                    {t("scan.fields.invoiceNumber")}
                    <input
                      type="text"
                      value={result.invoiceNumber}
                      onChange={(e) =>
                        updateField("invoiceNumber", e.target.value)
                      }
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                    />
                  </label>
                  <label className="block text-[13px] font-bold text-slate-700">
                    {t("scan.fields.documentType")}
                    <input
                      type="text"
                      value={result.documentType ?? ""}
                      onChange={(e) =>
                        updateField("documentType", e.target.value)
                      }
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                    />
                  </label>
                  <label className="block text-[13px] font-bold text-slate-700">
                    {t("scan.totalEditLabel")}
                    <input
                      type="number"
                      step="0.01"
                      value={result.total ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateField(
                          "total",
                          v === "" ? null : Number(v) || 0,
                        );
                        updateField("totalSuspect", false);
                      }}
                      className={`mt-1 block h-10 w-full rounded-lg border px-3 text-sm shadow-sm focus:ring-2 ${
                        result.totalSuspect
                          ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-200"
                          : "border-slate-300 focus:border-rose-400 focus:ring-rose-200"
                      }`}
                    />
                  </label>
                  <label className="block text-[13px] font-bold text-slate-700">
                    {t("scan.vatEditLabel")}
                    <input
                      type="number"
                      step="0.01"
                      value={result.vatAmount ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateField(
                          "vatAmount",
                          v === "" ? null : Number(v) || 0,
                        );
                      }}
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm shadow-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                    />
                  </label>
                </section>

                {/* Items table */}
                <section className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                    <h3 className="text-sm font-black text-slate-800">
                      {t("scan.itemsTitle", { count: result.items.length })}
                    </h3>
                    <button
                      type="button"
                      onClick={addBlankItem}
                      className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200"
                    >
                      {t("scan.addItem")}
                    </button>
                  </div>
                  {(result.skippedLinesCount ?? 0) > 0 ? (
                    <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                      {t("scan.skippedLinesHint", {
                        count: result.skippedLinesCount ?? 0,
                      })}
                    </p>
                  ) : null}
                  <div className="max-h-[40vh] overflow-auto">
                    {result.items.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-slate-500">
                        {t("scan.noItems")}
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {result.items.map((it, idx) => {
                          const itemConfTier = confidenceTier(
                            it.parseConfidence ??
                              it.confidenceScore ??
                              result.confidence,
                          );
                          const highlight =
                            it.lineStatus === "suspect" || it.ocrSuspect
                              ? "border-red-400 bg-red-50/80"
                              : it.isHigher
                                ? "border-rose-300 bg-rose-50/70"
                                : it.isLower
                                  ? "border-emerald-300 bg-emerald-50/70"
                                  : it.lineStatus === "review" || it.uncertain
                                    ? "border-amber-300 bg-amber-50/50"
                                    : it.lineStatus === "valid"
                                      ? "border-emerald-200 bg-emerald-50/30"
                                      : confidenceItemBorderClass(itemConfTier);
                          const lowConf =
                            (it.confidenceScore ?? 1) < 0.65 ||
                            it.lineStatus === "review" ||
                            it.uncertain;
                          const statusMsg =
                            it.lineStatus === "suspect" || it.ocrSuspect
                              ? t("scan.suspectAmount")
                              : lowConf
                                ? t("scan.needsVerification")
                                : it.lineStatus === "valid"
                                  ? t("scan.validLine")
                                  : null;
                          return (
                            <li
                              key={`${it.rawName}-${idx}`}
                              className={`grid gap-2 border-l-4 px-3 py-2 sm:grid-cols-[1fr_70px_110px_110px_28px] ${highlight}`}
                            >
                              {statusMsg ? (
                                <p
                                  className={`col-span-full flex items-center gap-1 text-[11px] font-bold ${
                                    it.lineStatus === "suspect" || it.ocrSuspect
                                      ? "text-red-800"
                                      : it.lineStatus === "valid"
                                        ? "text-emerald-800"
                                        : "text-amber-800"
                                  }`}
                                >
                                  {it.lineStatus === "valid" ? (
                                    <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />
                                  ) : (
                                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                                  )}
                                  {statusMsg}
                                </p>
                              ) : null}
                              {it.suggestedProductName && !it.supplierProductId ? (
                                <div className="col-span-full flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] font-bold text-sky-900">
                                  <span>
                                    {t("scan.similarProductFound", {
                                      name: it.suggestedProductName,
                                    })}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateItem(idx, {
                                        name: it.suggestedProductName!,
                                        supplierProductId: it.suggestedProductId,
                                      })
                                    }
                                    className="rounded-md bg-sky-700 px-2 py-0.5 text-[10px] font-black text-white hover:bg-sky-800"
                                  >
                                    {t("scan.linkSimilarProduct")}
                                  </button>
                                </div>
                              ) : null}
                              <input
                                type="text"
                                value={it.name}
                                onChange={(e) =>
                                  updateItem(idx, { name: e.target.value })
                                }
                                placeholder={t("scan.itemNamePlaceholder")}
                                className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                              />
                              <input
                                type="number"
                                step="0.01"
                                value={it.quantity}
                                onChange={(e) =>
                                  updateItem(idx, {
                                    quantity: Number(e.target.value) || 0,
                                  })
                                }
                                className="h-9 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-rose-400 focus:ring-2 focus:ring-rose-200"
                              />
                              <div className="min-w-0">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={it.unitPrice}
                                  onChange={(e) =>
                                    updateItem(idx, {
                                      unitPrice: Number(e.target.value) || 0,
                                    })
                                  }
                                  className={`h-9 w-full rounded-lg border px-2 text-sm focus:ring-2 ${
                                    it.isHigher
                                      ? "border-rose-400 bg-rose-50 focus:border-rose-500 focus:ring-rose-200"
                                      : it.isLower
                                        ? "border-emerald-400 bg-emerald-50 focus:border-emerald-500 focus:ring-emerald-200"
                                        : "border-slate-300 focus:border-rose-400 focus:ring-rose-200"
                                  }`}
                                />
                                {it.regularPrice ? (
                                  <p
                                    className={`mt-1 inline-flex items-center gap-1 text-[11px] font-bold ${
                                      it.isHigher
                                        ? "text-rose-700"
                                        : it.isLower
                                          ? "text-emerald-700"
                                          : "text-slate-500"
                                    }`}
                                    title={t("scan.priceTooltip", {
                                      price: formatShekel(it.regularPrice),
                                      samples: it.regularPriceSamples ?? 0,
                                    })}
                                  >
                                    {it.isHigher && (
                                      <>
                                        <TrendingUp className="h-3 w-3" aria-hidden />
                                        {t("scan.priceHigher")}
                                      </>
                                    )}
                                    {it.isLower && (
                                      <>
                                        <TrendingDown className="h-3 w-3" aria-hidden />
                                        {t("scan.priceLower")}
                                      </>
                                    )}
                                    {!it.isHigher && !it.isLower && (
                                      <>
                                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                                        {t("scan.priceMatch")}
                                      </>
                                    )}
                                    {it.isHigher && it.priceDifferencePercent != null ? (
                                      <span className="text-rose-800">
                                        {t("scan.priceDiff", {
                                          percent: Math.abs(it.priceDifferencePercent),
                                        })}
                                      </span>
                                    ) : null}
                                    <span className="opacity-75">
                                      ({formatShekel(it.regularPrice)})
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                              <div className="text-right text-sm font-black tabular-nums text-slate-800">
                                {formatShekel(it.lineTotal)}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                aria-label={t("scan.removeItem")}
                                className="self-center rounded-lg p-1 text-rose-600 hover:bg-rose-50"
                              >
                                <X className="h-4 w-4" aria-hidden />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-sm">
                    <span className="text-xs font-bold text-slate-500">
                      {result.vatAmount
                        ? t("scan.vatLabel", {
                            amount: formatShekel(result.vatAmount),
                          })
                        : t("scan.vatUnknown")}
                    </span>
                    <span className="font-black tabular-nums text-slate-900">
                      {t("scan.total")}: {formatShekel(grandTotal)}
                    </span>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!result || scanning}
            onClick={() => {
              if (result) {
                onApply(result);
                close();
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("scan.applyToForm")}
          </button>
        </div>
      </div>

      {showOcrDebug && result ? (
        <OcrDebugModal
          rawText={result.rawText}
          debug={scanDebug}
          docConfidence={result.confidence}
          onClose={() => setShowOcrDebug(false)}
          t={t}
          bcp47={bcp47}
        />
      ) : null}
    </div>
  );
}

const SCAN_STEP_KEYS = [
  "scan.scanStepUpload",
  "scan.scanStepText",
  "scan.scanStepTable",
  "scan.scanStepSupplier",
  "scan.scanStepTotals",
  "scan.scanStepProducts",
] as const;

function ScanLoadingPanel({
  step,
  t,
}: {
  step: number;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8">
      <div className="flex items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-rose-500" aria-hidden />
        <p className="text-base font-black text-slate-800">{t("scan.scanning")}</p>
      </div>
      <ul className="space-y-2">
        {SCAN_STEP_KEYS.map((key, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={key}
              className={`flex items-center gap-2 text-sm font-bold ${
                done
                  ? "text-emerald-700"
                  : active
                    ? "text-rose-700"
                    : "text-slate-400"
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              ) : active ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <span className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />
              )}
              {t(key)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function OcrDebugModal({
  rawText,
  debug,
  docConfidence,
  onClose,
  t,
  bcp47,
}: {
  rawText: string;
  debug: ScanDebugDto | null;
  docConfidence: number;
  onClose: () => void;
  t: (key: string) => string;
  bcp47: string;
}) {
  const conf = debug?.confidence ?? docConfidence;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-black text-slate-900">{t("scan.ocrDebugTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-600 hover:bg-slate-100"
            aria-label={t("scan.ocrDebugClose")}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="grid gap-2 border-b border-slate-100 px-4 py-3 text-xs">
          <DebugRow
            label={t("scan.ocrDebugProvider")}
            value={debug?.ocrProviderActive ?? debug?.provider ?? "—"}
          />
          <DebugRow
            label={t("scan.ocrDebugConfidence")}
            value={`${Math.round((debug?.ocrConfidence ?? conf) * 100)}%`}
          />
          {debug?.pageCount != null ? (
            <DebugRow label={t("scan.ocrDebugPages")} value={String(debug.pageCount)} />
          ) : null}
          {debug?.layoutOnlyMode ? (
            <p className="font-bold text-emerald-800">{t("scan.ocrDebugLayoutOnly")}</p>
          ) : null}
          <DebugRow
            label={t("scan.ocrDebugParseMs")}
            value={
              debug?.parseDurationMs != null
                ? `${debug.parseDurationMs.toLocaleString(bcp47)} ms`
                : "—"
            }
          />
          <DebugRow label={t("scan.ocrDebugItems")} value={String(debug?.itemsFound ?? 0)} />
          <DebugRow
            label={t("scan.ocrDebugTextLen")}
            value={String(debug?.textLength ?? rawText.length)}
          />
          <DebugRow label={t("scan.ocrDebugEngine")} value={debug?.ocrEngine ?? "—"} />
          <DebugRow
            label={t("scan.ocrDebugLanguage")}
            value={debug?.ocrLanguage ?? "—"}
          />
          <DebugRow
            label={t("scan.ocrDebugParseSource")}
            value={debug?.parseSource ?? "—"}
          />
          <DebugRow
            label={t("scan.ocrDebugOverlayCount")}
            value={String(debug?.overlayLineCount ?? 0)}
          />
          {debug?.blockCount != null ? (
            <DebugRow
              label={t("scan.ocrDebugBlocks")}
              value={String(debug.blockCount)}
            />
          ) : null}
          {debug?.detectedLanguages?.length ? (
            <DebugRow
              label={t("scan.ocrDebugDetectedLang")}
              value={debug.detectedLanguages.join(", ")}
            />
          ) : null}
          {debug?.garbageRatio != null ? (
            <DebugRow
              label={t("scan.ocrDebugGarbage")}
              value={`${Math.round(debug.garbageRatio * 100)}%`}
            />
          ) : null}
          {debug?.columnBands?.length ? (
            <DebugRow
              label={t("scan.ocrDebugColumns")}
              value={debug.columnBands.map((b) => b.kind).join(" | ")}
            />
          ) : null}
          {debug?.fromCache ? (
            <p className="font-bold text-slate-600">{t("scan.ocrDebugFromCache")}</p>
          ) : null}
          {debug?.ocrLanguage === "eng" ? (
            <p className="font-bold text-amber-800">{t("scan.ocrDebugEngWarning")}</p>
          ) : null}
          {debug?.needsManualReview ? (
            <p className="font-bold text-amber-900">{t("scan.ocrDebugManualReview")}</p>
          ) : null}
        </div>
        {debug?.visionWordsSample?.length ? (
          <details className="border-t border-slate-200">
            <summary className="cursor-pointer bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-900">
              {t("scan.ocrDebugWordSamples")}
            </summary>
            <pre className="max-h-[20vh] overflow-auto bg-slate-800 p-3 text-[10px] text-slate-100 whitespace-pre-wrap">
              {debug.visionWordsSample
                .map((w, i) => `${i + 1}. "${w.text}" x=${w.x} y=${w.y}`)
                .join("\n")}
            </pre>
          </details>
        ) : null}
        {debug?.firstOverlayLines?.length ? (
          <details className="border-t border-slate-200">
            <summary className="cursor-pointer bg-slate-50 px-4 py-2 text-xs font-black text-slate-700">
              {t("scan.ocrDebugFirstOverlay")}
            </summary>
            <pre className="max-h-[20vh] overflow-auto bg-slate-800 p-3 text-[10px] text-slate-100 whitespace-pre-wrap">
              {debug.firstOverlayLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}
            </pre>
          </details>
        ) : null}
        <details className="border-t border-slate-200">
          <summary className="cursor-pointer bg-slate-50 px-4 py-2 text-xs font-black text-slate-700">
            {t("scan.ocrDebugOverlayLines")}
          </summary>
          <pre className="max-h-[28vh] overflow-auto bg-slate-800 p-3 text-[10px] text-slate-100 whitespace-pre-wrap">
            {(debug?.overlayLinesPreview ?? [])
              .map((l, i) => `${i + 1}. [y=${l.top}] (${l.wordCount}w) ${l.text}`)
              .join("\n") || t("scan.noRawText")}
          </pre>
        </details>
        <details className="border-t border-slate-200">
          <summary className="cursor-pointer bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">
            {t("scan.ocrDebugRawPreview")}
          </summary>
          <pre className="max-h-[32vh] overflow-auto bg-slate-900 p-4 text-[10px] leading-relaxed text-slate-100 whitespace-pre-wrap">
            {debug?.rawOcrPreview || rawText || t("scan.noRawText")}
          </pre>
        </details>
        <details className="min-h-0 flex-1 overflow-hidden border-t border-slate-200">
          <summary className="cursor-pointer bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">
            {t("scan.showRawOcr")}
          </summary>
          <pre className="max-h-[40vh] overflow-auto bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100 whitespace-pre-wrap">
            {rawText || t("scan.noRawText")}
          </pre>
        </details>
        <div className="border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 py-2 text-sm font-bold text-white hover:bg-slate-900"
          >
            {t("scan.ocrDebugClose")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  highlight,
  highlightClass,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  highlightClass?: string;
}) {
  return (
    <tr>
      <td className="px-3 py-2 font-bold text-slate-600">{label}</td>
      <td
        className={`px-3 py-2 font-semibold text-slate-900 ${
          highlightClass ??
          (highlight ? "text-base font-black tabular-nums text-rose-700" : "")
        }`}
      >
        {value}
      </td>
    </tr>
  );
}
