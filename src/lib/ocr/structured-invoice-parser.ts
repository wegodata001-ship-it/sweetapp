import type { ScannedItem } from "./types";
import type { OcrPositionedLine } from "./ocr-overlay";
import { parseHebrewInvoiceByPosition } from "./hebrew-invoice-position-parser";
import { parseHebrewInvoiceTable } from "./hebrew-invoice-table-parser";
import { parseStructuredHeader, type StructuredHeader } from "./structured-invoice-header";
import { parseStructuredInvoiceRows } from "./structured-invoice-rows";
import { normalizeOcrText, splitOcrLines } from "./normalize-ocr-text";

export type StructuredInvoiceResult = {
  header: StructuredHeader;
  items: ScannedItem[];
  skipped: number;
  headerFound: boolean;
  parseSource: "position" | "structured-rows" | "text-table" | "none";
  columnBands?: { kind: string; minX: number; maxX: number; centerX: number }[];
};

/**
 * שלב 2 אחרי OCR גולמי — הבנת מבנה חשבונית ישראלית קבוע.
 */
export function parseStructuredInvoice(
  rawText: string,
  overlay: OcrPositionedLine[] = [],
): StructuredInvoiceResult {
  const text = normalizeOcrText(rawText ?? "");
  const lines = splitOcrLines(text);
  const header = parseStructuredHeader(text, lines);

  let items: ScannedItem[] = [];
  let skipped = 0;
  let headerFound = false;
  let parseSource: StructuredInvoiceResult["parseSource"] = "none";
  let columnBands: StructuredInvoiceResult["columnBands"];

  const structured = parseStructuredInvoiceRows(text);
  if (structured.items.length > 0) {
    items = structured.items;
    skipped = structured.skipped;
    headerFound = structured.headerFound;
    parseSource = "structured-rows";
  }

  if (items.length === 0 && overlay.length >= 3) {
    const pos = parseHebrewInvoiceByPosition(overlay);
    columnBands = pos.columnBands;
    if (pos.items.length > 0) {
      items = pos.items;
      skipped = pos.skipped;
      headerFound = pos.headerFound;
      parseSource = "position";
    }
  }

  if (items.length === 0) {
    const table = parseHebrewInvoiceTable(text);
    if (table.items.length > 0) {
      items = table.items;
      skipped = table.skipped;
      headerFound = table.headerFound;
      parseSource = "text-table";
    }
  }

  console.log("[structured-invoice]", {
    parseSource,
    items: items.length,
    supplier: header.supplierRawName,
    invoiceKind: header.invoiceKind,
    needsReview: header.needsReview,
  });

  return {
    header,
    items,
    skipped,
    headerFound,
    parseSource,
    columnBands,
  };
}
