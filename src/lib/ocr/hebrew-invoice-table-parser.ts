/**
 * Hebrew Invoice Table Parser — column-aware qty / price / total / barcode.
 * Designed for OCR.space output on Israeli tax invoices.
 */
import type { ScannedItem } from "./types";
import { splitOcrLines } from "./normalize-ocr-text";

const MAX_QTY = 500;
const MAX_UNIT_PRICE = 10_000;
const MAX_LINE_TOTAL = 100_000;
const BARCODE_MIN_DIGITS = 7;

const NUMBER_RE =
  /\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+|\d+\.\d{1,2}|\d+/g;

/** Lines to skip entirely (not product rows). */
const SKIP_LINE_RE =
  /^(?:מע[\"']?מ|מעמ|סה[\"']?כ|סהכ|סך\s*הכל|סה[\"']?כ\s*לתשלום|סהכ\s*לתשלום|סה[\"']?כ\s*לפני|הנחה|כולל\s*מע|טלפון|פקס|phone|fax|כתובת|address|ברקוד\s*[:：]?$|עוסק\s*מורשה|ח\.?\s*פ|תאריך\s*[:：]?\s*\d|שעה\s*[:：])/i;

const TABLE_HEADER_RE =
  /מק[\"']?ט|מקט|שם\s*פריט|תיאור\s*פריט|תאור|כמות|מחיר|מחיר\s*יח|סה[\"']?כ(?!\s*לתשלום)/i;

const FOOTER_ROW_RE =
  /סה[\"']?כ\s*לפני|סה[\"']?כ\s*לתשלום|סהכ\s*לתשלום|סך\s*הכל|כולל\s*מע[\"']?מ|^מע[\"']?מ\s|^הנחה\s/i;

type ColumnMap = {
  sku?: number;
  description?: number;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
};

type NumberRole = "barcode" | "sku" | "quantity" | "unitPrice" | "lineTotal" | "unknown";

export type TableParseResult = {
  items: ScannedItem[];
  skipped: number;
  headerFound: boolean;
};

export function parseNumber(raw: string): number {
  if (!raw) return NaN;
  let s = raw
    .replace(/[\u20AA\u20AC\u0024\u00A3₪]/g, "")
    .replace(/\s/g, "")
    .trim();
  if (/,\d{3}/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  return Number.parseFloat(s);
}

function letterCount(s: string): number {
  return (s.match(/[a-zA-Z\u0590-\u05FF]/gi) ?? []).length;
}

function tokenizeNumbers(line: string): number[] {
  return tokenizeNumberTokens(line).map((t) => t.value);
}

function tokenizeNumberTokens(line: string): { value: number; raw: string }[] {
  const out: { value: number; raw: string }[] = [];
  const re = new RegExp(NUMBER_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = parseNumber(m[0]);
    if (Number.isFinite(n) && n > 0) out.push({ value: n, raw: m[0] });
  }
  return out;
}

function isBarcodeInLine(n: number, raw: string, line: string): boolean {
  if (isBarcodeNumber(n, raw)) return true;
  if (lineHasSkuContext(line) && !/[.,]/.test(raw) && digitLength(n) >= 5) {
    return true;
  }
  return false;
}

function digitLength(n: number): number {
  return String(Math.floor(Math.abs(n))).replace(/\D/g, "").length;
}

/** Step 6 — long integer = barcode / מק"ט, not price. */
export function isBarcodeNumber(n: number, rawToken?: string): boolean {
  if (!Number.isFinite(n)) return true;
  if (n > MAX_UNIT_PRICE) return true;
  if (digitLength(n) >= BARCODE_MIN_DIGITS) return true;
  if (Number.isInteger(n) && n >= 100_000) return true;
  if (rawToken && !/[.,]/.test(rawToken) && digitLength(n) >= 6 && n >= 10_000) {
    return true;
  }
  return false;
}

function lineHasSkuContext(line: string): boolean {
  return /מק[\"']?ט|מקט|ברקוד|barcode|sku/i.test(line);
}

function isFooterLine(line: string): boolean {
  return FOOTER_ROW_RE.test(line.trim());
}

function shouldSkipLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (SKIP_LINE_RE.test(t)) return true;
  if (isFooterLine(t)) return true;
  if (/^[\d\s.,\-₪%]+$/.test(t) && letterCount(t) === 0) return true;
  return false;
}

function isTableHeaderLine(line: string): boolean {
  if (!TABLE_HEADER_RE.test(line)) return false;
  const hits = [
    /מק[\"']?ט|מקט/i.test(line),
    /שם|תיאור|תאור/i.test(line),
    /כמות/i.test(line),
    /מחיר/i.test(line),
  ].filter(Boolean).length;
  return hits >= 2;
}

/** Step 4 — column positions from header row (split on 2+ spaces or tabs). */
function detectColumns(headerLine: string): ColumnMap | null {
  const parts = headerLine
    .split(/\s{2,}|\t/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;

  const map: ColumnMap = {};
  parts.forEach((part, idx) => {
    const p = part.toLowerCase();
    if (/מק[\"']?ט|^מקט$|sku|code/i.test(p)) map.sku = idx;
    else if (/שם|תיאור|תאור|פריט|description/i.test(p)) map.description = idx;
    else if (/כמות|qty|quantity/i.test(p)) map.quantity = idx;
    else if (/מחיר|price/i.test(p) && !/סה[\"']?כ|סהכ/i.test(p)) map.unitPrice = idx;
    else if (/סה[\"']?כ|סהכ|total/i.test(p)) map.lineTotal = idx;
  });

  if (map.quantity == null && map.unitPrice == null) return null;
  return map;
}

function splitRowCells(line: string): string[] {
  if (line.includes("\t")) {
    return line.split("\t").map((c) => c.trim());
  }
  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  }
  return [line];
}

function cellAt(cells: string[], idx: number | undefined): string {
  if (idx == null || idx < 0 || idx >= cells.length) return "";
  return cells[idx] ?? "";
}

/** Parse one row when header columns are known. */
function parseRowWithColumns(line: string, cols: ColumnMap): ScannedItem | null {
  const cells = splitRowCells(line);
  if (cells.length < 2) return parseRowHeuristic(line);

  const desc =
    cellAt(cells, cols.description) ||
    cells.find((c) => letterCount(c) >= 2 && tokenizeNumbers(c).length === 0) ||
    "";

  const qty = parseNumber(cellAt(cells, cols.quantity));
  const price = parseNumber(cellAt(cells, cols.unitPrice));
  const total = parseNumber(cellAt(cells, cols.lineTotal));

  const skuCell = cellAt(cells, cols.sku);
  const skuNum = parseNumber(skuCell);

  let quantity = Number.isFinite(qty) && qty > 0 ? qty : NaN;
  let unitPrice = Number.isFinite(price) && price > 0 ? price : NaN;
  let lineTotal = Number.isFinite(total) && total > 0 ? total : NaN;

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return parseRowHeuristic(line, cols);
  }

  if (!Number.isFinite(lineTotal)) lineTotal = quantity * unitPrice;

  const rawName =
    desc.trim() ||
    cells
      .filter((c) => letterCount(c) >= 2 && !/^\d+$/.test(c.replace(/\s/g, "")))
      .join(" ")
      .trim();

  if (letterCount(rawName) < 2) return null;
  if (isBarcodeNumber(unitPrice) || isBarcodeNumber(lineTotal)) return null;

  const item = buildItem(rawName, quantity, unitPrice, lineTotal);
  if (!item) return null;

  if (isBarcodeNumber(skuNum) && digitLength(skuNum) >= BARCODE_MIN_DIGITS) {
    item.confidenceScore = Math.min(item.confidenceScore ?? 1, 0.75);
    item.lineStatus = "review";
    item.uncertain = true;
  }
  return item;
}

type Triple = { quantity: number; unitPrice: number; lineTotal: number };

/** Step 5 — try all sensible assignments of 3 numbers to qty/price/total. */
function resolveThreeNumbers(nums: number[]): Triple | null {
  const usable = nums.filter((n) => !isBarcodeNumber(n));
  if (usable.length < 2) return null;

  if (usable.length === 2) {
    const [a, b] = usable;
    if (a <= MAX_QTY && b <= MAX_UNIT_PRICE && a <= b) {
      return { quantity: a, unitPrice: b, lineTotal: a * b };
    }
    if (b <= MAX_QTY && a <= MAX_UNIT_PRICE) {
      return { quantity: b, unitPrice: a, lineTotal: a * b };
    }
    return { quantity: 1, unitPrice: a, lineTotal: b };
  }

  const candidates: number[][] = [];
  if (usable.length >= 3) {
    candidates.push([usable[0], usable[1], usable[2]]);
    candidates.push([usable[usable.length - 3], usable[usable.length - 2], usable[usable.length - 1]]);
  }

  let best: { triple: Triple; score: number } | null = null;

  for (const [n1, n2, n3] of candidates) {
    const perms: [number, number, number][] = [
      [n1, n2, n3],
      [n1, n3, n2],
      [n2, n1, n3],
      [n2, n3, n1],
      [n3, n1, n2],
      [n3, n2, n1],
    ];
    for (const [q, p, t] of perms) {
      if (q > MAX_QTY || p > MAX_UNIT_PRICE || t > MAX_LINE_TOTAL) continue;
      if (isBarcodeNumber(q) || isBarcodeNumber(p)) continue;
      const expected = q * p;
      const err = Math.abs(expected - t) / Math.max(t, 1);
      const score = err < 0.06 ? 1 - err : err < 0.15 ? 0.7 - err : 0.2;
      if (!best || score > best.score) {
        best = { triple: { quantity: q, unitPrice: p, lineTotal: t }, score };
      }
    }
  }

  if (best && best.score > 0.35) return best.triple;

  const [q, p, t] = usable.slice(-3);
  if (q <= MAX_QTY && p <= MAX_UNIT_PRICE && t <= MAX_LINE_TOTAL) {
    return { quantity: q, unitPrice: p, lineTotal: t };
  }
  return null;
}

function stripNumbersFromLine(line: string): string {
  return line
    .replace(NUMBER_RE, " ")
    .replace(/[×x*₪]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Step 3 + 5 — heuristic row without column map. */
function parseRowHeuristic(line: string, _cols?: ColumnMap): ScannedItem | null {
  if (shouldSkipLine(line) || isTableHeaderLine(line)) return null;

  const tokens = tokenizeNumberTokens(line);
  const nums = tokens.map((t) => t.value);
  const barcodes = tokens.filter((t) => isBarcodeInLine(t.value, t.raw, line));
  const usable = tokens
    .filter((t) => !isBarcodeInLine(t.value, t.raw, line))
    .map((t) => t.value);

  if (usable.length === 0) return null;
  if (usable.length === 1 && letterCount(line) < 3) return null;

  let rawName = stripNumbersFromLine(line);
  if (letterCount(rawName) < 2) {
    rawName = line.replace(NUMBER_RE, "").trim();
  }
  if (letterCount(rawName) < 2) return null;
  if (/^(?:מע[\"']?מ|סה[\"']?כ|הנחה|כמות|מחיר)\b/i.test(rawName)) return null;

  const triple = resolveThreeNumbers(nums);
  if (!triple) {
    if (usable.length === 1) {
      const p = usable[0];
      if (p <= MAX_UNIT_PRICE) {
        return buildItem(rawName, 1, p, p);
      }
    }
    return null;
  }

  const item = buildItem(rawName, triple.quantity, triple.unitPrice, triple.lineTotal);
  if (!item) return null;

  if (barcodes.length > 0) {
    item.confidenceScore = Math.min(item.confidenceScore ?? 1, 0.72);
    if ((item.confidenceScore ?? 0) < 0.8) {
      item.lineStatus = "review";
      item.uncertain = true;
    }
  }
  return item;
}

/** Step 8 — confidence → lineStatus. */
function scoreTriple(q: number, p: number, t: number): number {
  if (q <= 0 || p <= 0 || t <= 0) return 0.2;
  const expected = q * p;
  const err = Math.abs(expected - t) / Math.max(t, expected, 1);
  if (err <= 0.02) return 0.95;
  if (err <= 0.06) return 0.82;
  if (err <= 0.12) return 0.65;
  if (err <= 0.2) return 0.5;
  return 0.35;
}

function buildItem(
  rawName: string,
  quantity: number,
  unitPrice: number,
  lineTotal: number,
): ScannedItem | null {
  if (quantity <= 0 || quantity > MAX_QTY) return null;
  if (unitPrice <= 0 || unitPrice > MAX_UNIT_PRICE) return null;
  if (lineTotal <= 0 || lineTotal > MAX_LINE_TOTAL) return null;
  if (letterCount(rawName) < 2) return null;

  const confidenceScore = scoreTriple(quantity, unitPrice, lineTotal);
  let lineStatus: ScannedItem["lineStatus"] = "valid";
  let uncertain = false;

  if (confidenceScore >= 0.8) {
    lineStatus = "valid";
  } else if (confidenceScore >= 0.55) {
    lineStatus = "review";
    uncertain = true;
  } else {
    lineStatus = "review";
    uncertain = true;
  }

  return {
    rawName,
    name: rawName,
    productId: null,
    unit: null,
    quantity,
    unitPrice,
    lineTotal,
    confidenceScore,
    lineStatus,
    uncertain,
    ocrSuspect: false,
    regularPrice: null,
    regularPriceSamples: 0,
    isHigher: false,
    isLower: false,
    priceFlagKey: null,
  };
}

function findTableBounds(lines: string[]): {
  headerIdx: number;
  cols: ColumnMap | null;
  bodyStart: number;
  bodyEnd: number;
} {
  let headerIdx = -1;
  let cols: ColumnMap | null = null;

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    if (isTableHeaderLine(lines[i])) {
      headerIdx = i;
      cols = detectColumns(lines[i]);
      break;
    }
  }

  let bodyStart = headerIdx >= 0 ? headerIdx + 1 : 0;
  let bodyEnd = lines.length;

  if (headerIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      if (/שם\s*פריט|תיאור\s*פריט|כמות.*מחיר/i.test(lines[i])) {
        bodyStart = i + 1;
        break;
      }
    }
  }

  for (let i = bodyStart; i < lines.length; i++) {
    if (isFooterLine(lines[i])) {
      bodyEnd = i;
      break;
    }
  }

  return { headerIdx, cols, bodyStart, bodyEnd };
}

function dedupeItems(items: ScannedItem[]): ScannedItem[] {
  const seen = new Set<string>();
  const out: ScannedItem[] = [];
  for (const it of items) {
    const key = `${it.rawName}|${it.quantity}|${it.unitPrice}|${it.lineTotal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Main entry — parse line items from OCR text.
 */
export function parseHebrewInvoiceTable(rawText: string): TableParseResult {
  const lines = splitOcrLines(rawText);
  const { headerIdx, cols, bodyStart, bodyEnd } = findTableBounds(lines);

  console.log("[hebrew-table] lines:", lines.length, "header:", headerIdx, "cols:", cols);

  const items: ScannedItem[] = [];
  let skipped = 0;

  for (let i = bodyStart; i < bodyEnd; i++) {
    const line = lines[i];
    if (shouldSkipLine(line) || isTableHeaderLine(line)) {
      skipped++;
      continue;
    }

    const item = cols ? parseRowWithColumns(line, cols) : parseRowHeuristic(line);
    if (item) {
      items.push(item);
    } else {
      const letters = letterCount(line);
      const nums = tokenizeNumbers(line).filter((n) => !isBarcodeNumber(n));
      if (letters >= 2 && nums.length >= 1) {
        skipped++;
      }
    }
  }

  const merged = dedupeItems(items);
  console.log("[hebrew-table] items:", merged.length, "skipped:", skipped);

  return {
    items: merged,
    skipped,
    headerFound: headerIdx >= 0,
  };
}
