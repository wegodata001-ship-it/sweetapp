import { NextResponse } from "next/server";

export type ScannedItem = {
  rawName: string;
  name: string;
  productId?: string | null;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  confidenceScore?: number;
  parseConfidence?: number;
  lineStatus?: "valid" | "review" | "suspect";
  uncertain?: boolean;
  regularPrice?: number | null;
  regularPriceSamples?: number;
  isHigher?: boolean;
  isLower?: boolean;
  priceFlagKey?: "higher" | "lower" | "match" | null;
  priceDifferencePercent?: number | null;
  /** השוואת מחיר מול מחירון ספק — רק בהוצאות */
  priceCompareStatus?: "new" | "unchanged" | "increased" | "decreased";
  priceDeltaAmount?: number | null;
  priceDeltaPercent?: number | null;
  supplierProductId?: string | null;
  suggestedProductId?: string | null;
  suggestedProductName?: string | null;
  productMatchScore?: number | null;
};

export type ScannedDocument = {
  supplierRawName: string;
  supplierName: string;
  supplierId?: string | null;
  suggestNewSupplier?: boolean;
  suggestedSupplierId?: string | null;
  suggestedSupplierName?: string | null;
  supplierMatchScore?: number | null;
  fromAiCache?: boolean;
  invoiceNumber: string;
  date: string;
  time?: string;
  documentType?: string;
  invoiceKind?: "expense" | "credit";
  fieldConfidence?: {
    supplier?: number;
    invoiceNumber?: number;
    date?: number;
    total?: number;
    invoiceKind?: number;
  };
  needsReviewFields?: string[];
  vatAmount?: number | null;
  total?: number | null;
  itemsSumDetected?: number;
  totalSuspect?: boolean;
  parseQualityOk?: boolean;
  parseQualityIssues?: ("supplier" | "invoiceNumber" | "date" | "total" | "parse")[];
  items: ScannedItem[];
  skippedLinesCount?: number;
  /** סיכום השוואת מחירים — הוצאות ספק בלבד */
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
  /** gemini_vision */
  engine: string;
  confidence: number;
  partial?: boolean;
};

export type ScanDebugMeta = {
  provider: string;
  confidence: number;
  textLength: number;
  itemsFound: number;
  parseDurationMs: number;
  aiEngine?: string;
  aiModel?: string;
  aiProviderActive?: "gemini_vision";
  geminiVisionProvider?: "gemini_vision";
  geminiModel?: string;
  fileHash?: string;
  fileSizeBytes?: number;
  inputMode?: "preprocessed" | "pdf_native";
  pdfPageCount?: number;
  fromCache?: boolean;
  partial?: boolean;
  needsReviewFields?: string[];
  needsManualReview?: boolean;
  rawAiPreview?: string;
  aiRawResponsePreview?: string;
  geminiStructuredJson?: unknown;
  validation?: {
    ok: boolean;
    detectedCount: number;
    missingFields: string[];
  };
  mappedFields?: {
    supplier: string;
    invoiceNumber: string;
    date: string;
    total: number | null;
    vat: number | null;
    documentType: string;
  };
  parseQualityOk?: boolean;
  parseQualityIssues?: string[];
};

export type ScanApiSuccess = {
  success: true;
  ok: true;
  data: ScannedDocument & { error?: string; partial?: boolean };
  provider: string;
  debug?: ScanDebugMeta;
};

export type ScanApiFailure = {
  success: false;
  ok: false;
  error: string;
  provider: string;
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
    provider: debug?.provider ?? "gemini_vision",
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
      provider: "gemini_vision",
      ...(code ? { code } : {}),
    },
    { status },
  );
}
