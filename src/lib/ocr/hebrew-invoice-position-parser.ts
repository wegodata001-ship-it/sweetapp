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
import { isOcrGarbageText } from "./normalize-hebrew-ocr";
import { normalizeRtlLine } from "./rtl-document-normalize";
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
  columnBands?: { kind: string; minX: number; maxX: number; centerX: number }[];
  parseSource: "position";
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
  return expandColumnBands(bands);
}

/** Partition full row width between detected header columns. */
function expandColumnBands(bands: ColumnBand[]): ColumnBand[] {
  const sorted = [...bands].sort((a, b) => a.centerX - b.centerX);
  for (let i = 0; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const leftMid = prev ? (prev.centerX + sorted[i].centerX) / 2 : 0;
    const rightMid = next
      ? (sorted[i].centerX + next.centerX) / 2
      : sorted[i].maxX + 400;
    sorted[i] = {
      ...sorted[i],
      minX: Math.max(0, leftMid - 8),
      maxX: rightMid + 8,
    };
  }
  return sorted;
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
): Record<ColumnKind, OcrPositionedWord[]> {
  const cells: Record<ColumnKind, OcrPositionedWord[]> = {
    sku: [],
    description: [],
    quantity: [],
    unitPrice: [],
    lineTotal: [],
    unknown: [],
  };
  for (const w of words) {
    const col = assignWordToColumn(w, bands);
    cells[col].push(w);
  }
  return cells;
}

function joinDescriptionWords(descWords: OcrPositionedWord[]): string {
  const sorted = [...descWords].sort((a, b) => b.centerX - a.centerX);
  return normalizeRtlLine(sorted.map((w) => w.text).join(" "));
}

function parseNumericCell(words: OcrPositionedWord[]): number {
  const joined = words.map((w) => w.text).join(" ");
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
  if (!isReadableProductName(rawName) || isOcrGarbageText(rawName)) return null;
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
  const text = normalizeRtlLine(line.text);
  if (shouldSkipItemLine(text)) return null;

  const cells = wordsToCells(line.words, bands);
  let rawName = joinDescriptionWords(cells.description);
  if (!rawName) {
    const unknownText = cells.unknown
      .filter((w) => !/^\d+([.,]\d+)?$/.test(w.text))
      .sort((a, b) => b.centerX - a.centerX)
      .map((w) => w.text)
      .join(" ");
    rawName = normalizeRtlLine(unknownText) || text.replace(NUMBER_RE, "").trim();
  }

  let quantity = parseNumericCell(cells.quantity);
  let unitPrice = parseNumericCell(cells.unitPrice);
  let lineTotal = parseNumericCell(cells.lineTotal);

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return null;
  }
  if (!Number.isFinite(lineTotal)) lineTotal = quantity * unitPrice;

  return buildItemFromRow(rawName, quantity, unitPrice, lineTotal);
}

/** כשאין שורת כותרת — מסיק 3 עמודות מספריות (כמות, מחיר, סה״כ) ממיקום X */
function inferColumnBandsFromDataRows(
  overlay: OcrPositionedLine[],
  bodyStart: number,
  bodyEnd: number,
): ColumnBand[] {
  const numericCenters: number[] = [];
  let descMinX = Infinity;
  let descMaxX = 0;

  for (let i = bodyStart; i < bodyEnd; i++) {
    for (const w of overlay[i].words) {
      const t = w.text.replace(/,/g, "");
      if (/^\d+(\.\d{1,2})?$/.test(t)) {
        const n = parseFloat(t);
        if (n > 0 && n < 500_000) numericCenters.push(w.centerX);
      } else if (!/^\d{4,12}$/.test(t) && /[א-תa-z]/i.test(t)) {
        descMinX = Math.min(descMinX, w.left);
        descMaxX = Math.max(descMaxX, w.left + w.width);
      }
    }
  }

  if (numericCenters.length < 6) return [];

  numericCenters.sort((a, b) => a - b);
  const clusters: number[][] = [[numericCenters[0]]];
  const gap = 35;
  for (let i = 1; i < numericCenters.length; i++) {
    const x = numericCenters[i];
    const last = clusters[clusters.length - 1];
    if (x - last[last.length - 1] <= gap) last.push(x);
    else clusters.push([x]);
  }

  const merged = clusters
    .map((c) => c.reduce((a, b) => a + b, 0) / c.length)
    .sort((a, b) => a - b);

  const numericBands: ColumnKind[] = ["quantity", "unitPrice", "lineTotal"];
  const pick = merged.slice(-3);
  if (pick.length < 2) return [];

  const bands: ColumnBand[] = pick.map((centerX, idx) => {
    const kind = numericBands[numericBands.length - pick.length + idx] ?? "lineTotal";
    return {
      kind,
      centerX,
      minX: centerX - 50,
      maxX: centerX + 50,
    };
  });

  if (descMaxX > descMinX) {
    bands.unshift({
      kind: "description",
      centerX: (descMinX + descMaxX) / 2,
      minX: descMinX - 8,
      maxX: pick[0] - 20,
    });
    bands.unshift({
      kind: "sku",
      centerX: descMinX - 40,
      minX: 0,
      maxX: descMinX - 10,
    });
  }

  return expandColumnBands(bands);
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
    const text = normalizeRtlLine(overlay[i].text);
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
    if (isFooterLine(normalizeRtlLine(overlay[i].text))) {
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
    return { items: [], skipped: 0, headerFound: false, parseSource: "position" };
  }

  let { headerIdx, bands, bodyStart, bodyEnd } = findTableBounds(overlay);
  if (bands.length < 2) {
    const inferred = inferColumnBandsFromDataRows(overlay, bodyStart, bodyEnd);
    if (inferred.length >= 2) {
      bands = inferred;
      console.log("[hebrew-position] inferred column bands from data rows");
    }
  }
  if (bands.length < 2) {
    return { items: [], skipped: 0, headerFound: false, parseSource: "position" };
  }

  const columnBands = bands.map((b) => ({
    kind: b.kind,
    minX: Math.round(b.minX),
    maxX: Math.round(b.maxX),
    centerX: Math.round(b.centerX),
  }));

  const items: ScannedItem[] = [];
  let skipped = 0;

  for (let i = bodyStart; i < bodyEnd; i++) {
    const line = overlay[i];
    const text = normalizeRtlLine(line.text);
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
    columnBands,
    parseSource: "position",
  };
}
