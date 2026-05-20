/**
 * מנוע הבנת חשבונית — Layout-first (קואורדינטות X/Y), לא regex על טקסט שטוח.
 *
 * שלבים:
 * 1. refine overlay (קיבוץ מילים לשורות)
 * 2. כותרת מאזור עליון (30% ראשונים)
 * 3. טבלה לפי עמודות ממיקום מילים
 * 4. רק אם נכשל — regex על טקסט
 */
import type { ScannedItem } from "./types";
import type { OcrPositionedLine } from "./ocr-overlay";
import { parseHebrewInvoiceByPosition } from "./hebrew-invoice-position-parser";
import { parseHebrewInvoiceTable } from "./hebrew-invoice-table-parser";
import { parseStructuredInvoiceRows } from "./structured-invoice-rows";
import {
  parseStructuredHeader,
  parseStructuredHeaderFromOverlay,
  type StructuredHeader,
} from "./structured-invoice-header";
import { overlayLayoutQuality, refineOverlayLines } from "./overlay-line-rebuild";
import { normalizeOcrText, splitOcrLines } from "./normalize-ocr-text";
import { isLayoutOnlyMode } from "./ocr-hard-verify";

export type LayoutInvoiceResult = {
  header: StructuredHeader;
  items: ScannedItem[];
  skipped: number;
  headerFound: boolean;
  parseSource: "layout-position" | "structured-rows" | "text-table" | "none";
  columnBands?: { kind: string; minX: number; maxX: number; centerX: number }[];
  layoutQuality: { usable: boolean; wordCount: number; avgWordsPerLine: number };
  refinedOverlay: OcrPositionedLine[];
};

export function parseInvoiceByLayout(
  rawText: string,
  overlayInput: OcrPositionedLine[] = [],
): LayoutInvoiceResult {
  const text = normalizeOcrText(rawText ?? "");
  const lines = splitOcrLines(text);
  const refinedOverlay = refineOverlayLines(overlayInput);
  const layoutQuality = overlayLayoutQuality(refinedOverlay);

  let header: StructuredHeader;
  if (layoutQuality.usable) {
    header = parseStructuredHeaderFromOverlay(refinedOverlay, text);
  } else {
    header = parseStructuredHeader(text, lines);
  }

  let items: ScannedItem[] = [];
  let skipped = 0;
  let headerFound = false;
  let parseSource: LayoutInvoiceResult["parseSource"] = "none";
  let columnBands: LayoutInvoiceResult["columnBands"];

  if (layoutQuality.usable) {
    const pos = parseHebrewInvoiceByPosition(refinedOverlay);
    columnBands = pos.columnBands;
    if (pos.items.length > 0) {
      items = pos.items;
      skipped = pos.skipped;
      headerFound = pos.headerFound;
      parseSource = "layout-position";
    }
  }

  if (items.length === 0 && !isLayoutOnlyMode()) {
    const structured = parseStructuredInvoiceRows(text);
    if (structured.items.length > 0) {
      items = structured.items;
      skipped = structured.skipped;
      headerFound = structured.headerFound;
      parseSource = "structured-rows";
    }
  }

  if (items.length === 0 && !isLayoutOnlyMode()) {
    const table = parseHebrewInvoiceTable(text);
    if (table.items.length > 0) {
      items = table.items;
      skipped = table.skipped;
      headerFound = table.headerFound;
      parseSource = "text-table";
    }
  }

  if (isLayoutOnlyMode() && items.length === 0) {
    console.warn("[invoice-layout] layout-only mode — no regex fallback; items empty");
  }

  console.log("[invoice-layout]", {
    parseSource,
    layoutUsable: layoutQuality.usable,
    overlayLines: refinedOverlay.length,
    words: layoutQuality.wordCount,
    items: items.length,
    supplier: header.supplierRawName?.slice(0, 40),
  });

  return {
    header,
    items,
    skipped,
    headerFound,
    parseSource,
    columnBands,
    layoutQuality,
    refinedOverlay,
  };
}
