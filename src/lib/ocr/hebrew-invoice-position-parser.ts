/**
 * Parse invoice table rows using OCR.space word X positions (not word order).
 */
import type { ScannedItem } from "./types";
import { parseNumber, isBarcodeNumber } from "./hebrew-invoice-table-parser";
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
} from "./invoice-line-sanity";
import { fixRtlLineText } from "./normalize-ocr-text";
import type { OcrPositionedLine, OcrPositionedWord } from "./ocr-overlay";

const NUMBER_RE =
  /\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+|\d+\.\d{1,2}|\d+/g;

type ColumnKind = "sku" | "description" | "quantity" | "unitPrice" | "lineTotal" | "unknown";

type ColumnBand = {
  kind: ColumnKind;
  centerX: number;
  minX: number;
  maxX: number;
};

export type PositionParseResult = {
  items: ScannedItem[];
  skipped: number;
  headerFound: boolean;
};

function classifyHeaderWord(text: string): ColumnKind {
  const t = text.trim().toLowerCase();
  if (/מק[\"']?ט|^מקט$|sku|code/i.test(t)) return "sku";
  if (/שם|תיאור|תאור|פריט|description/i.test(t)) return "description";
  if (/כמות|qty/i.test(t)) return "quantity";
  if (/מחיר|price/i.test(t) && !/סה[\"']?כ|סהכ/i.test(t)) return "unitPrice";
  if (/סה[\"']?כ|סהכ|total/i.test(t)) return "lineTotal";
  return "unknown";
}

function detectColumnBands(headerLine: OcrPositionedLine): ColumnBand[] {
  const bands: ColumnBand[] = [];
  for (const w of headerLine.words) {
    const kind = classifyHeaderWord(w.text);
    if (kind === "unknown") continue;
    const pad = Math.max(w.width * 0.6, 12);
    bands.push({
      kind,
      centerX: w.centerX,
      minX: w.left - pad,
      maxX: w.left + w.width + pad,
    });
  }
  if (bands.length < 2) return [];
  bands.sort((a, b) => a.centerX - b.centerX);
  return bands;
}

function assignWordToColumn(
  w: OcrPositionedWord,
  bands: ColumnBand[],
): ColumnKind {
  let best: { kind: ColumnKind; dist: number } | null = null;
  for (const b of bands) {
    if (w.centerX >= b.minX && w.centerX <= b.maxX) {
      return b.kind;
    }
    const dist = Math.abs(w.centerX - b.centerX);
    if (!best || dist < best.dist) best = { kind: b.kind, dist };
  }
  return best?.kind ?? "unknown";
}

function wordsToCells(
  words: OcrPositionedWord[],
  bands: ColumnBand[],
): Record<ColumnKind, string[]> {
  const cells: Record<ColumnKind, string[]> = {
    sku: [],
    description: [],
    quantity: [],
    unitPrice: [],
    lineTotal: [],
    unknown: [],
  };
  for (const w of words) {
    const col = assignWordToColumn(w, bands);
    cells[col].push(w.text);
  }
  return cells;
}

function parseNumericCell(parts: string[]): number {
  const joined = parts.join(" ");
  const re = new RegExp(NUMBER_RE.source, "g");
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined)) !== null) {
    const n = parseNumber(m[0]);
    if (Number.isFinite(n) && n > 0 && !isBarcodeNumber(n, m[0])) nums.push(n);
  }
  return nums.length > 0 ? nums[nums.length - 1] : NaN;
}

function buildItemFromRow(
  rawName: string,
  quantity: number,
  unitPrice: number,
  lineTotal: number,
): ScannedItem | null {
  if (!isReadableProductName(rawName)) return null;
  if (isUnreasonableTriple(quantity, unitPrice, lineTotal)) {
    return buildItemWithStatus(rawName, quantity, unitPrice, lineTotal, 0.25, "suspect", true);
  }

  const parseConfidence = scoreTripleConfidence(quantity, unitPrice, lineTotal);
  if (violatesNumericCaps(quantity, unitPrice, lineTotal, parseConfidence)) {
    return buildItemWithStatus(rawName, quantity, unitPrice, lineTotal, 0.3, "suspect", true);
  }
  if (quantity <= 0 || quantity > SANITY_MAX_QTY) return null;
  if (unitPrice <= 0 || unitPrice > SANITY_MAX_UNIT_PRICE) return null;

  let lineStatus: ScannedItem["lineStatus"] = "valid";
  let uncertain = false;
  if (parseConfidence < 0.55) {
    lineStatus = "suspect";
    uncertain = true;
  } else if (parseConfidence < 0.8) {
    lineStatus = "review";
    uncertain = true;
  }

  return buildItemWithStatus(
    rawName,
    quantity,
    unitPrice,
    lineTotal,
    parseConfidence,
    lineStatus,
    uncertain,
  );
}

function buildItemWithStatus(
  rawName: string,
  quantity: number,
  unitPrice: number,
  lineTotal: number,
  parseConfidence: number,
  lineStatus: ScannedItem["lineStatus"],
  uncertain: boolean,
): ScannedItem {
  return {
    rawName,
    name: rawName,
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

function parsePositionRow(
  line: OcrPositionedLine,
  bands: ColumnBand[],
): ScannedItem | null {
  const text = fixRtlLineText(line.text);
  if (shouldSkipItemLine(text)) return null;

  const cells = wordsToCells(line.words, bands);
  const rawName = fixRtlLineText(cells.description.join(" ").trim()) || text.replace(NUMBER_RE, "").trim();

  let quantity = parseNumericCell(cells.quantity);
  let unitPrice = parseNumericCell(cells.unitPrice);
  let lineTotal = parseNumericCell(cells.lineTotal);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return null;
  }
  if (!Number.isFinite(lineTotal)) lineTotal = quantity * unitPrice;

  return buildItemFromRow(rawName, quantity, unitPrice, lineTotal);
}

function findTableBounds(overlay: OcrPositionedLine[]): {
  headerIdx: number;
  bands: ColumnBand[];
  bodyStart: number;
  bodyEnd: number;
} {
  let headerIdx = -1;
  let bands: ColumnBand[] = [];

  for (let i = 0; i < Math.min(overlay.length, 45); i++) {
    const text = fixRtlLineText(overlay[i].text);
    if (isTableHeaderLine(text) && overlay[i].words.length >= 2) {
      headerIdx = i;
      bands = detectColumnBands(overlay[i]);
      if (bands.length >= 2) break;
      headerIdx = -1;
      bands = [];
    }
  }

  const bodyStart = headerIdx >= 0 ? headerIdx + 1 : 0;
  let bodyEnd = overlay.length;
  for (let i = bodyStart; i < overlay.length; i++) {
    if (isFooterLine(fixRtlLineText(overlay[i].text))) {
      bodyEnd = i;
      break;
    }
  }

  return { headerIdx, bands, bodyStart, bodyEnd };
}

export function parseHebrewInvoiceByPosition(
  overlay: OcrPositionedLine[],
): PositionParseResult {
  if (overlay.length === 0) {
    return { items: [], skipped: 0, headerFound: false };
  }

  const { headerIdx, bands, bodyStart, bodyEnd } = findTableBounds(overlay);
  if (bands.length < 2) {
    return { items: [], skipped: 0, headerFound: false };
  }

  const items: ScannedItem[] = [];
  let skipped = 0;

  for (let i = bodyStart; i < bodyEnd; i++) {
    const line = overlay[i];
    const text = fixRtlLineText(line.text);
    if (shouldSkipItemLine(text) || isTableHeaderLine(text)) {
      skipped++;
      continue;
    }
    if (line.words.length < 2) {
      skipped++;
      continue;
    }

    const item = parsePositionRow(line, bands);
    if (item) items.push(item);
    else if (letterCount(text) >= 2) skipped++;
  }

  console.log(
    "[hebrew-position] header:",
    headerIdx,
    "bands:",
    bands.map((b) => b.kind),
    "items:",
    items.length,
  );

  return {
    items,
    skipped,
    headerFound: headerIdx >= 0,
  };
}
