import type { ScannedItem } from "./types";
import type { OcrPositionedLine } from "./ocr-overlay";
import type { StructuredHeader } from "./structured-invoice-header";
import { parseInvoiceByLayout } from "./invoice-layout-engine";

export type StructuredInvoiceResult = {
  header: StructuredHeader;
  items: ScannedItem[];
  skipped: number;
  headerFound: boolean;
  parseSource:
    | "layout-position"
    | "structured-rows"
    | "text-table"
    | "position"
    | "none";
  columnBands?: { kind: string; minX: number; maxX: number; centerX: number }[];
};

/**
 * שלב 2 אחרי OCR — Layout-first (עמודות לפי X/Y), טקסט רק כ-fallback.
 */
export function parseStructuredInvoice(
  rawText: string,
  overlay: OcrPositionedLine[] = [],
): StructuredInvoiceResult {
  const layout = parseInvoiceByLayout(rawText, overlay);
  const parseSource =
    layout.parseSource === "layout-position"
      ? "layout-position"
      : layout.parseSource;

  return {
    header: layout.header,
    items: layout.items,
    skipped: layout.skipped,
    headerFound: layout.headerFound,
    parseSource,
    columnBands: layout.columnBands,
  };
}
