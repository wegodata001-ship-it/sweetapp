import { NextResponse } from "next/server";
import type { ScannedDocument } from "./types";

const PROVIDER = "ocr.space" as const;

export type ScanDebugMeta = {
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
  /** SHA-256 של הקובץ המקורי — להשוואת LOCAL מול PROD */
  fileHash?: string;
  fileSizeBytes?: number;
  ocrInputMode?: "signed_url" | "direct_buffer";
};

export type ScanApiSuccess = {
  success: true;
  ok: true;
  data: ScannedDocument & { error?: string; partial?: boolean };
  provider: typeof PROVIDER;
  debug?: ScanDebugMeta;
};

export type ScanApiFailure = {
  success: false;
  ok: false;
  error: string;
  provider: typeof PROVIDER;
  code?: string;
};

export function scanJsonSuccess(
  data: ScannedDocument & { error?: string; partial?: boolean },
  debug?: ScanDebugMeta,
): NextResponse<ScanApiSuccess> {
  return NextResponse.json({
    success: true,
    ok: true,
    data,
    provider: PROVIDER,
    ...(debug ? { debug } : {}),
  });
}

export function scanJsonError(
  error: string,
  status: number,
  code?: string,
): NextResponse<ScanApiFailure> {
  return NextResponse.json(
    {
      success: false,
      ok: false,
      error,
      provider: PROVIDER,
      ...(code ? { code } : {}),
    },
    { status },
  );
}
