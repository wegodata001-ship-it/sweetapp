/**
 * Shared types for the expense document scanner (OCR + parsing pipeline).
 *
 * The pipeline is:
 *   1. Caller uploads a file (image or PDF) to /api/expenses/scan
 *   2. The file is run through an OCR engine producing raw text
 *   3. The text is parsed into a structured ScannedDocument
 *   4. Each line item is matched against Supplier/Product records and a
 *      price baseline computed from historical FinancialDocumentItem rows
 *   5. The structured result is returned for review in the UI
 */

export type ScannedItem = {
  /** Raw item name as detected by OCR (best effort) */
  rawName: string;
  /** Canonical product name we matched to (or the raw name when no match) */
  name: string;
  /** Optional product id from our DB (if matched) */
  productId?: string | null;
  /** Optional unit hint detected from text ("kg", "יח", "ק״ג" etc) */
  unit?: string | null;
  /** Quantity (defaults to 1 when not detected) */
  quantity: number;
  /** Unit price extracted (currency-stripped) */
  unitPrice: number;
  /** Line total (qty × unit price when known, else best-effort) */
  lineTotal: number;
  /** Parser confidence 0–1 for this line */
  confidenceScore?: number;
  /** valid = green, review = orange, suspect = red (excluded from auto-add) */
  lineStatus?: "valid" | "review" | "suspect";
  /** Huge / invalid OCR amount detected */
  ocrSuspect?: boolean;
  /** True when parser is unsure — UI may warn the user */
  uncertain?: boolean;
  /** Median/avg historical price for this product (when available) */
  regularPrice?: number | null;
  /** Number of historical observations the baseline is built from */
  regularPriceSamples?: number;
  /** True when unitPrice is ≥ 15 % above regularPrice */
  isHigher?: boolean;
  /** True when unitPrice is ≤ 15 % below regularPrice */
  isLower?: boolean;
  /** UX message describing the price comparison (translated by client) */
  priceFlagKey?: "higher" | "lower" | "match" | null;
  /** % difference vs catalog regular price (when from SupplierProduct) */
  priceDifferencePercent?: number | null;
  /** Matched row in supplier price catalog */
  supplierProductId?: string | null;
  /** Fuzzy catalog match — user may confirm */
  suggestedProductId?: string | null;
  suggestedProductName?: string | null;
  productMatchScore?: number | null;
};

export type ScannedDocument = {
  /** Best guess at the supplier name (raw) */
  supplierRawName: string;
  /** Canonical supplier name when matched */
  supplierName: string;
  /** Optional supplier id when matched */
  supplierId?: string | null;
  /** When true — supplier not in DB; UI may offer "create supplier" */
  suggestNewSupplier?: boolean;
  /** Detected invoice number (free-form) */
  invoiceNumber: string;
  /** ISO date string (YYYY-MM-DD) — best effort */
  date: string;
  /** Time string HH:mm when detected */
  time?: string;
  /** Document type hint ("invoice", "receipt", "delivery_note", "credit") */
  documentType?: string;
  /** Detected VAT amount when present */
  vatAmount?: number | null;
  /** Detected grand total */
  total?: number | null;
  /** Parsed line items */
  items: ScannedItem[];
  /** Lines skipped by parser (header/meta/low confidence) */
  skippedLinesCount?: number;
  /** Raw OCR text (for debugging / manual review) */
  rawText: string;
  /** Public URL of the uploaded file when saved to storage */
  receiptFileUrl?: string | null;
  /** Original file name from the upload */
  receiptFileName?: string | null;
  /** Engine used: "google_vision" | "manual" | etc. */
  engine: string;
  /** Confidence 0-1 (rough heuristic; UI uses to soften wording) */
  confidence: number;
};

export type OcrEngineResult = {
  text: string;
  engine: string;
  confidence: number;
};
