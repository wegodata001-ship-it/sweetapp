import type { ScannedItem } from "./types";
import { normalizeLineTriple } from "./hebrew-decimal-normalize";
import { parseNumber, isBarcodeNumber } from "./hebrew-invoice-table-parser";
import { fixRtlLineText, splitOcrLines } from "./normalize-ocr-text";
import {
  isFooterLine,
  isTableHeaderLine,
  letterCount,
  shouldSkipItemLine,
  isReadableProductName,
} from "./ocr-line-filters";
import {
  isUnreasonableTriple,
  scoreTripleConfidence,
  violatesNumericCaps,
  SANITY_MAX_QTY,
  SANITY_MAX_UNIT_PRICE,
  SANITY_MAX_LINE_TOTAL,
} from "./invoice-line-sanity";

const MAX_QTY = SANITY_MAX_QTY;
const MAX_UNIT_PRICE = SANITY_MAX_UNIT_PRICE;
const MAX_LINE_TOTAL = SANITY_MAX_LINE_TOTAL;

/** שורת פריט קלאסית: מק"ט / שם / כמות / מחיר / סה"כ */
const STRUCTURED_ROW_RE =
  /^(\d{4,9})\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

const TABLE_HEADER_MARKERS =
  /מפתח\s*פריט|מק[\"']?ט|מקט|שם\s*פריט|כמות|מחיר|סה[\"']?כ|%?\s*הנחה/i;

export function isStructuredTableHeaderLine(line: string): boolean {
  if (!TABLE_HEADER_MARKERS.test(line)) return false;
  const hits = [
    /מפתח|מק[\"']?ט|מקט|פריט|שם/i.test(line),
    /כמות/i.test(line),
    /מחיר|סה[\"']?כ/i.test(line),
  ].filter(Boolean).length;
  return hits >= 2 || isTableHeaderLine(line);
}

function buildItem(
  rawName: string,
  quantity: number,
  unitPrice: number,
  lineTotal: number,
  itemCode?: string,
): ScannedItem | null {
  const name = itemCode ? `${itemCode} ${rawName}`.trim() : rawName;
  if (!isReadableProductName(rawName)) return null;
  if (isUnreasonableTriple(quantity, unitPrice, lineTotal)) return null;

  const norm = normalizeLineTriple(quantity, unitPrice, lineTotal);
  quantity = norm.quantity;
  unitPrice = norm.unitPrice;
  lineTotal = norm.lineTotal;

  const parseConfidence = scoreTripleConfidence(quantity, unitPrice, lineTotal);
  if (violatesNumericCaps(quantity, unitPrice, lineTotal, parseConfidence)) return null;

  let lineStatus: ScannedItem["lineStatus"] = "valid";
  let uncertain = false;
  if (parseConfidence < 0.55) {
    lineStatus = "suspect";
    uncertain = true;
  } else if (parseConfidence < 0.8) {
    lineStatus = "review";
    uncertain = true;
  }

  return {
    rawName: name,
    name,
    productId: null,
    unit: null,
    quantity,
    unitPrice,
    lineTotal,
    confidenceScore: parseConfidence,
    parseConfidence,
    lineStatus,
    uncertain,
    ocrSuspect: lineStatus === "suspect",
    regularPrice: null,
    regularPriceSamples: 0,
    isHigher: false,
    isLower: false,
    priceFlagKey: null,
  };
}

function tryParseStructuredRow(line: string): ScannedItem | null {
  const m = line.match(STRUCTURED_ROW_RE);
  if (!m) return null;

  const itemCode = m[1];
  const desc = m[2].trim();
  const norm = normalizeLineTriple(
    parseNumber(m[3]),
    parseNumber(m[4]),
    parseNumber(m[5]),
    { qty: m[3], price: m[4], total: m[5] },
  );

  if (isBarcodeNumber(norm.unitPrice) || norm.quantity > MAX_QTY) return null;
  return buildItem(desc, norm.quantity, norm.unitPrice, norm.lineTotal, itemCode);
}

function findTableBodyBounds(lines: string[]): { start: number; end: number; headerFound: boolean } {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 45); i++) {
    if (isStructuredTableHeaderLine(lines[i])) {
      headerIdx = i;
      break;
    }
  }

  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (isFooterLine(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end, headerFound: headerIdx >= 0 };
}

export type StructuredTableResult = {
  items: ScannedItem[];
  skipped: number;
  headerFound: boolean;
  parseSource: "structured-rows";
};

/**
 * Parser לטבלת פריטים לפי מבנה קבוע (מפתח פריט → שורות מוצר).
 */
export function parseStructuredInvoiceRows(rawText: string): StructuredTableResult {
  const lines = splitOcrLines(rawText).map((l) => fixRtlLineText(l));
  const { start, end, headerFound } = findTableBodyBounds(lines);

  const items: ScannedItem[] = [];
  let skipped = 0;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (shouldSkipItemLine(line) || isStructuredTableHeaderLine(line)) {
      skipped++;
      continue;
    }

    const structured = tryParseStructuredRow(line);
    if (structured) {
      items.push(structured);
      continue;
    }

    if (letterCount(line) >= 2 && /\d/.test(line)) {
      skipped++;
    }
  }

  console.log("[structured-rows] items:", items.length, "header:", headerFound);

  return {
    items,
    skipped,
    headerFound,
    parseSource: "structured-rows",
  };
}
