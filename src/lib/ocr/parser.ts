import type { ScannedDocument, ScannedItem } from "./types";
import { normalizeOcrText, splitOcrLines } from "./normalize-ocr-text";
import type { OcrPositionedLine } from "./ocr-overlay";
import { parseStructuredInvoice } from "./structured-invoice-parser";
import { isLayoutOnlyMode } from "./ocr-hard-verify";

export type ParseReceiptOptions = {
  overlay?: OcrPositionedLine[];
};

export type ParseReceiptMeta = {
  parseSource:
    | "layout-position"
    | "position"
    | "structured-rows"
    | "text-table"
    | "legacy"
    | "fallback"
    | "none";
  headerFound: boolean;
  columnBands?: { kind: string; minX: number; maxX: number; centerX: number }[];
  overlayLineCount: number;
  invoiceKind?: "expense" | "credit";
  needsReviewFields?: string[];
};
import {
  extractHebrewInvoiceFields,
  parseFallbackLineItems,
} from "./parser-fallback";

/**
 * Israeli RTL invoice parser — table-only, RTL qty/price rules, strict filters.
 */

const MIN_ITEM_CONFIDENCE = 0.5;
const MIN_ITEM_CONFIDENCE_SHORT = 0.42;
const MAX_UNIT_PRICE = 10_000;
const MAX_LINE_TOTAL = 100_000;
const MAX_QUANTITY = 500;

const NUMBER_TOKEN_RE =
  /\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+|\d+\.\d{1,2}|\d+/g;

export const BLOCKED_WORDS = [
  "טלפון",
  "פקס",
  "ברקוד",
  "מספר לקוח",
  "מספרכם",
  "סהכ",
  'סה"כ',
  "סה״כ",
  "מע״מ",
  'מע"מ',
  "מעמ",
  "הנחה",
  "ע.מ",
  "עוסק",
  "ח.פ",
  "חפ",
  "תאריך",
  "שעה",
  "לתשלום",
  "לפני מעמ",
  "לאחר הנחה",
  "כולל מע",
  "עוסק מורשה",
  "חשבונית",
  "מקור",
  "העתק",
  "phone",
  "fax",
  "barcode",
  "vat",
  "total",
];

export const BLOCKED_PRODUCT_NAMES = [
  "סהכ",
  'סה"כ',
  "סה״כ",
  "מע״מ",
  'מע"מ',
  "מעמ",
  "הנחה",
  "תשלום",
  "לפני מעמ",
  "לפני מע״מ",
  "לאחר הנחה",
  "סהכ לפני",
  "סהכ לתשלום",
  "סך הכל",
  "כולל מע",
  "מעמ 18",
  "מע״מ 18",
];

const TABLE_END_MARKERS = [
  /סה[\"']?כ\s*לפני\s*מע/i,
  /סהכ\s*לפני\s*מע/i,
  /סה[\"']?כ\s*לתשלום/i,
  /סהכ\s*לתשלום/i,
  /סך\s*הכל\s*לתשלום/i,
  /כולל\s*מע[\"']?מ/i,
  /^מע[\"']?מ\s/i,
  /^מעמ\s/i,
  /^הנחה\s/i,
  /לאחר\s*הנחה/i,
];

const HEBREW_TOTAL_PRIORITY = [
  "סה\"כ לתשלום",
  "סהכ לתשלום",
  "כולל מע\"מ",
  "סה\"כ",
  "סהכ",
];
const HEBREW_VAT = ["מע\"מ", "מעמ", "מע״מ"];
const HEBREW_INVOICE = ["מספר חשבונית", "מס' חשבונית", "חשבונית מס"];
const HEBREW_DATE = ["תאריך"];
const HEBREW_SUPPLIER_HINT = ["ספק", "הספק"];

const UNIT_PATTERNS = [
  { re: /\b(kg|ק"ג|קג|ק׳ג)\b/i, label: "ק\"ג" },
  { re: /\b(gr|gram|גרם)\b/i, label: "גרם" },
  { re: /\b(l|liter|ליטר)\b/i, label: "ליטר" },
  { re: /\b(pack|מארז|אריזות)\b/i, label: "מארז" },
  { re: /\b(unit|יח|יח'|יח׳|pcs)\b/i, label: "יח׳" },
];

const WEIGHT_IN_NAME_RE = /(\d+(?:[.,]\d+)?)\s*(?:ק["']?ג|קג|גרם|ליטר)/i;

export function parseNumber(raw: string): number {
  if (!raw) return NaN;
  let s = raw
    .replace(/[\u20AA\u20AC\u0024\u00A3₪]/g, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return NaN;
  if (/,\d{3}/.test(s)) s = s.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForMatch(s: string): string {
  return s
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/["'״׳]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function splitLines(text: string): string[] {
  return splitOcrLines(text);
}

function letterCount(s: string): number {
  return (s.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/gi) ?? []).length;
}

function hasRealWords(s: string): boolean {
  return letterCount(s) >= 2;
}

function nameIsNumericOnly(name: string): boolean {
  const t = name.replace(/[\s.,\-_/\\'"״]/g, "");
  return t.length > 0 && /^\d+$/.test(t);
}

function isBlockedProductName(name: string): boolean {
  const n = normalizeForMatch(name);
  if (!n) return true;
  return BLOCKED_PRODUCT_NAMES.some((b) => n.includes(normalizeForMatch(b)));
}

function containsBlockedWord(line: string): boolean {
  if (/מספר\s*חשבונית|חשבונית\s*מס|invoice\s*#/i.test(line)) return false;
  const lower = line.toLowerCase();
  return BLOCKED_WORDS.some((w) => lower.includes(w.toLowerCase()));
}

function isLongIdNumber(n: number): boolean {
  if (!Number.isFinite(n)) return true;
  if (n > MAX_UNIT_PRICE) return true;
  const digits = String(Math.floor(Math.abs(n))).replace(/\D/g, "");
  return digits.length >= 7;
}

function isNumericOnlyLine(line: string): boolean {
  const stripped = line.replace(/[\s.,\-₪%]/g, "");
  return stripped.length > 0 && /^\d+$/.test(stripped);
}

function isPhoneOrIdLine(line: string): boolean {
  if (/\b05\d{8}\b/.test(line.replace(/\s/g, ""))) return true;
  if (/(?:טלפון|פקס|ברקוד|phone|fax|barcode)/i.test(line)) return true;
  if (/עוסק\s*מורשה|ח\.?\s*פ|מס[\"']?\s*עוסק|מספר\s*לקוח/i.test(line)) return true;
  const digits = line.replace(/\D/g, "");
  if (digits.length >= 8 && letterCount(line) < 4) return true;
  return false;
}

function isTableHeaderRow(line: string): boolean {
  const hasDesc = /שם\s*פריט|תיאור\s*פריט|תאור\s*פריט|מס\s*פריט|תיאור/i.test(line);
  const hasCol = /כמות|מחיר|אריזות|סה[\"']?כ|מק[\"']?ט/i.test(line);
  return hasDesc && hasCol;
}

/** Strict footer only — do not stop on column header "סה\"כ" inside the table. */
function isTableEndRow(line: string): boolean {
  const t = line.trim();
  if (TABLE_END_MARKERS.some((re) => re.test(t))) return true;
  if (/סה[\"']?כ\s*לפני\s*מע|סהכ\s*לפני\s*מע/i.test(t)) return true;
  if (/סה[\"']?כ\s*לתשלום|סהכ\s*לתשלום|סך\s*הכל\s*לתשלום/i.test(t)) return true;
  if (/^מע[\"']?מ\s*(\d|%|[:.])/i.test(t)) return true;
  if (/^הנחה\s*[:.]?\s*[\d,.]/i.test(t)) return true;
  if (/^סיכום\s*ביניים/i.test(t)) return true;
  if (isBlockedProductName(t) && letterCount(t) < 12) return true;
  return false;
}

function looksLikeShortProductName(name: string): boolean {
  if (letterCount(name) < 2) return false;
  return /ארגז|שק|ק"ג|חלב|סוכר|קמח|מלח|שמן|אוף|תירס|עמילן|פתית/i.test(name);
}

function isExcludedLine(line: string): boolean {
  if (containsBlockedWord(line)) return true;
  if (isNumericOnlyLine(line)) return true;
  if (isPhoneOrIdLine(line)) return true;
  if (isTableEndRow(line)) return true;
  if (/^\d{1,2}:\d{2}/.test(line) && letterCount(line) < 6) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line) && letterCount(line) < 6) return true;
  if (/^[\s\d.,\-]*(כמות|מחיר|אריזות|מס\s*פריט|שם\s*פריט)[\s\d.,\-]*$/i.test(line)) {
    return true;
  }
  if (/מע[\"']?מ\s*\d{1,2}\s*%/i.test(line)) return true;
  return false;
}

/** All numeric tokens on a line (before filtering). */
export function tokenizeNumbers(line: string): number[] {
  const out: number[] = [];
  const re = new RegExp(NUMBER_TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const v = parseNumber(m[0]);
    if (Number.isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

/** Weight/size numbers inside product name — not qty/price. */
function weightNumbersInText(text: string): Set<number> {
  const set = new Set<number>();
  const re = /(\d+(?:[.,]\d+)?)\s*(?:ק["']?ג|קג|גרם|ליטר|שק)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = parseNumber(m[1]);
    if (Number.isFinite(v)) set.add(v);
  }
  return set;
}

/**
 * Numbers usable for qty/price in RTL table rows.
 * Drops: IDs, barcode, weight-in-name, leading מספר פריט.
 */
function filterRtlTableNumbers(line: string, rawName: string): number[] {
  const all = tokenizeNumbers(line);
  const weights = weightNumbersInText(rawName + " " + line);
  const filtered: number[] = [];

  for (let i = 0; i < all.length; i++) {
    const n = all[i];
    if (isLongIdNumber(n)) continue;
    if (weights.has(n) && i < all.length - 2) continue;

    // Leading item code (מספר פריט) — small int at line start before Hebrew name
    if (
      i === 0 &&
      all.length >= 3 &&
      Number.isInteger(n) &&
      n < 10_000 &&
      letterCount(rawName) >= 4
    ) {
      continue;
    }

    filtered.push(n);
  }
  return filtered;
}

/**
 * RTL Israeli invoice: last number ≈ unit price, one before ≈ quantity.
 */
function resolveRtlQtyPrice(
  line: string,
  rawName: string,
  numbers: number[],
): { quantity: number; unitPrice: number; lineTotal: number } | null {
  const nums = filterRtlTableNumbers(line, rawName);
  if (nums.length === 0) return null;

  if (nums.length === 1) {
    const p = nums[0];
    if (p > MAX_UNIT_PRICE) return null;
    return { quantity: 1, unitPrice: p, lineTotal: p };
  }

  const last = nums[nums.length - 1];
  const prev = nums[nums.length - 2];

  if (nums.length >= 3) {
    const third = nums[nums.length - 3];
    const b = prev;
    const c = last;
    if (
      third <= MAX_QUANTITY &&
      b <= MAX_UNIT_PRICE &&
      c <= MAX_LINE_TOTAL &&
      Math.abs(third * b - c) <= Math.max(0.1, c * 0.04)
    ) {
      return { quantity: third, unitPrice: b, lineTotal: c };
    }
    if (
      b <= MAX_QUANTITY &&
      c <= MAX_UNIT_PRICE &&
      Math.abs(b * c - third) <= Math.max(0.1, third * 0.04)
    ) {
      return { quantity: b, unitPrice: c, lineTotal: third };
    }
    if (third <= 20 && b <= MAX_QUANTITY && c <= MAX_UNIT_PRICE) {
      return { quantity: b, unitPrice: c, lineTotal: b * c };
    }
  }

  // Core RTL rule: אחרון = מחיר, לפניו = כמות
  if (prev <= MAX_QUANTITY && last <= MAX_UNIT_PRICE && prev <= last) {
    return { quantity: prev, unitPrice: last, lineTotal: prev * last };
  }

  if (prev <= MAX_UNIT_PRICE && last <= MAX_LINE_TOTAL && prev <= last) {
    return { quantity: 1, unitPrice: prev, lineTotal: last };
  }

  if (last <= MAX_UNIT_PRICE) {
    return { quantity: 1, unitPrice: last, lineTotal: last };
  }

  return null;
}

function stripNumbers(line: string): string {
  return line
    .replace(NUMBER_TOKEN_RE, "")
    .replace(/[×x*]/gi, "")
    .replace(/[.\u2026\u2013\u2014\-_/|₪]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProductNameRtl(line: string): string {
  const parts = line.split(/\s{2,}|\t/);
  let best = "";
  for (const p of parts) {
    const t = stripNumbers(p).trim();
    if (letterCount(t) > letterCount(best)) best = t;
  }
  const full = stripNumbers(line);
  if (letterCount(full) >= letterCount(best)) return full;
  return best;
}

function detectUnit(line: string): string | null {
  for (const u of UNIT_PATTERNS) if (u.re.test(line)) return u.label;
  return null;
}

function findTableRegion(lines: string[]): { start: number; end: number } | null {
  let headerEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isTableHeaderRow(lines[i])) {
      headerEnd = i + 1;
      break;
    }
  }

  if (headerEnd < 0) {
    let descIdx = -1;
    let colIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 45); i++) {
      if (/שם\s*פריט|תיאור\s*פריט|תאור\s*פריט|מס\s*פריט/i.test(lines[i])) {
        descIdx = i;
      }
      if (/כמות|מחיר|אריזות/i.test(lines[i]) && descIdx >= 0) {
        colIdx = i;
      }
    }
    if (descIdx >= 0) {
      headerEnd = Math.max(descIdx, colIdx) + 1;
    }
  }

  if (headerEnd < 0) return null;

  while (headerEnd < lines.length && isExcludedLine(lines[headerEnd])) {
    headerEnd++;
  }

  let end = lines.length;
  for (let i = headerEnd; i < lines.length; i++) {
    if (isTableEndRow(lines[i])) {
      end = i;
      break;
    }
  }

  return { start: headerEnd, end };
}

/** Merge RTL rows split across lines (name line + qty/price line). */
function groupRtlProductLines(lines: string[], start: number, end: number): string[] {
  const merged: string[] = [];
  let pending = "";

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isTableEndRow(line)) break;
    if (containsBlockedWord(line) || isPhoneOrIdLine(line) || isNumericOnlyLine(line)) {
      continue;
    }
    if (/^[\s\d.,\-]*(כמות|מחיר|אריזות|מס\s*פריט|שם\s*פריט)[\s\d.,\-]*$/i.test(line)) {
      continue;
    }

    const name = extractProductNameRtl(line);
    const hasName = letterCount(name) >= 2;
    const nums = tokenizeNumbers(line).filter((n) => !isLongIdNumber(n) && n <= MAX_UNIT_PRICE);

    if (hasName) {
      if (pending) merged.push(pending);
      pending = line;
      if (nums.length >= 2) {
        merged.push(pending);
        pending = "";
      }
    } else if (pending && nums.length > 0 && nums.length <= 4) {
      pending = `${pending} ${line}`;
      merged.push(pending);
      pending = "";
    } else if (pending && i + 1 < end) {
      const next = lines[i + 1];
      const nextNums = tokenizeNumbers(next).filter((n) => !isLongIdNumber(n) && n <= MAX_UNIT_PRICE);
      if (nextNums.length > 0 && letterCount(extractProductNameRtl(next)) < 2) {
        pending = `${pending} ${line} ${next}`;
        merged.push(pending);
        pending = "";
        i += 1;
      }
    }
  }
  if (pending) merged.push(pending);
  return merged;
}

function classifyLine(
  confidenceScore: number,
  unitPrice: number,
  lineTotal: number,
  rawName: string,
): { lineStatus: ScannedItem["lineStatus"]; ocrSuspect: boolean; uncertain: boolean } {
  const huge =
    unitPrice > MAX_UNIT_PRICE ||
    lineTotal > MAX_LINE_TOTAL ||
    nameIsNumericOnly(rawName) ||
    isBlockedProductName(rawName);
  if (huge) {
    return { lineStatus: "suspect", ocrSuspect: true, uncertain: true };
  }
  if (confidenceScore < MIN_ITEM_CONFIDENCE) {
    return { lineStatus: "review", ocrSuspect: false, uncertain: true };
  }
  if (confidenceScore < 0.75) {
    return { lineStatus: "review", ocrSuspect: false, uncertain: true };
  }
  return { lineStatus: "valid", ocrSuspect: false, uncertain: false };
}

function scoreItem(
  rawName: string,
  line: string,
  quantity: number,
  unitPrice: number,
  lineTotal: number,
): number {
  let score = 0;
  const letters = letterCount(rawName);
  if (letters >= 4) score += 0.35;
  else if (letters >= 2) score += 0.2;
  if (detectUnit(line) || WEIGHT_IN_NAME_RE.test(line)) score += 0.15;
  if (quantity >= 1 && quantity <= MAX_QUANTITY) score += 0.15;
  if (unitPrice > 0 && unitPrice <= MAX_UNIT_PRICE) score += 0.2;
  if (Math.abs(quantity * unitPrice - lineTotal) <= Math.max(0.1, lineTotal * 0.06)) {
    score += 0.15;
  }
  if (isExcludedLine(line) || isBlockedProductName(rawName)) score -= 0.9;
  return Math.max(0, Math.min(1, score));
}

function parseRtlTableLine(line: string): ScannedItem | null {
  if (containsBlockedWord(line) || isPhoneOrIdLine(line)) return null;
  if (isNumericOnlyLine(line) && letterCount(line) < 3) return null;

  const rawName = extractProductNameRtl(line);
  if (!rawName || !hasRealWords(rawName) || nameIsNumericOnly(rawName)) return null;
  if (isBlockedProductName(rawName)) return null;

  const resolved = resolveRtlQtyPrice(line, rawName, tokenizeNumbers(line));
  if (!resolved) return null;

  const { quantity, unitPrice, lineTotal } = resolved;
  if (unitPrice <= 0 || unitPrice > MAX_UNIT_PRICE) return null;
  if (quantity <= 0 || quantity > MAX_QUANTITY) return null;
  if (lineTotal > MAX_LINE_TOTAL) return null;

  const confidenceScore = scoreItem(rawName, line, quantity, unitPrice, lineTotal);
  const minConf = looksLikeShortProductName(rawName)
    ? MIN_ITEM_CONFIDENCE_SHORT
    : MIN_ITEM_CONFIDENCE;
  if (confidenceScore < minConf) return null;

  const flags = classifyLine(confidenceScore, unitPrice, lineTotal, rawName);
  if (flags.ocrSuspect) return null;

  return {
    rawName,
    name: rawName,
    productId: null,
    unit: detectUnit(line),
    quantity,
    unitPrice,
    lineTotal,
    confidenceScore,
    ...flags,
    regularPrice: null,
    regularPriceSamples: 0,
    isHigher: false,
    isLower: false,
    priceFlagKey: null,
  };
}

function extractTableItems(lines: string[]): { items: ScannedItem[]; skipped: number } {
  const region = findTableRegion(lines);
  if (!region) {
    console.log("[parser] RTL table region not found");
    return { items: [], skipped: lines.length };
  }

  console.log("[parser] RTL table rows", region.start, "→", region.end);
  const rowLines = groupRtlProductLines(lines, region.start, region.end);
  const items: ScannedItem[] = [];
  let skipped = 0;

  for (const line of rowLines) {
    const item = parseRtlTableLine(line);
    if (item) items.push(item);
    else skipped++;
  }

  // Second pass: short product names missed in grouping
  for (let i = region.start; i < region.end; i++) {
    if (isTableEndRow(lines[i])) break;
    const name = extractProductNameRtl(lines[i]);
    if (letterCount(name) < 2 || !looksLikeShortProductName(name)) continue;
    const blob = [lines[i], lines[i + 1] ?? "", lines[i + 2] ?? ""].join(" ");
    const item = parseRtlTableLine(blob);
    if (item && !items.some((x) => x.rawName === item.rawName && x.unitPrice === item.unitPrice)) {
      items.push(item);
    }
  }

  return { items: dedupeItems(items), skipped };
}

function dedupeItems(items: ScannedItem[]): ScannedItem[] {
  const seen = new Set<string>();
  const out: ScannedItem[] = [];
  for (const it of items) {
    const key = `${it.rawName}|${it.quantity}|${it.unitPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function extractAfterKeyword(text: string, keywords: string[]): string {
  for (const k of keywords) {
    const re = new RegExp(
      `${escapeRegExp(k)}\\s*[:\\-\u2013\u2014]?\\s*([^\\n\\r]+)`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function toIsoDate(raw: string): string {
  const m1 = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  }
  const m2 = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m2) {
    let y = m2[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  return "";
}

function extractDate(text: string): string {
  for (const kw of HEBREW_DATE) {
    const re = new RegExp(
      `${escapeRegExp(kw)}\\s*[:\\-\u2013\u2014]?\\s*(\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{2,4})`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) {
      const iso = toIsoDate(m[1]);
      if (iso) return iso;
    }
  }
  const generic = text.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
  if (generic) {
    const iso = toIsoDate(generic[1]);
    if (iso) return iso;
  }
  return "";
}

function extractTime(text: string): string {
  return text.match(/שעה\s*[:.]?\s*(\d{1,2}:\d{2})/i)?.[1] ?? "";
}

function extractInvoiceNumber(text: string): string {
  for (const kw of HEBREW_INVOICE) {
    const re = new RegExp(
      `${escapeRegExp(kw)}\\s*[#:\\-\u2013\u2014]?\\s*([A-Za-z0-9\\-_/]+)`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1] && m[1].length >= 2 && m[1].length <= 20) return m[1].trim();
  }
  return "";
}

function extractAmountByKeywords(text: string, keywords: string[]): number | null {
  for (const kw of keywords) {
    const re = new RegExp(
      `${escapeRegExp(kw)}[^\\n]{0,60}?(${NUMBER_TOKEN_RE.source})(?!\\s*%)`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseNumber(m[1]);
      if (Number.isFinite(n) && n > 0 && n <= MAX_LINE_TOTAL) return n;
    }
  }
  return null;
}

function extractTotal(text: string, lines: string[]): number | null {
  for (const kw of HEBREW_TOTAL_PRIORITY) {
    const n = extractAmountByKeywords(text, [kw]);
    if (n !== null) return n;
  }
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12); i--) {
    if (!/סה[\"']?כ|לתשלום/i.test(lines[i])) continue;
    const nums = tokenizeNumbers(lines[i]).filter((n) => !isLongIdNumber(n) && n <= MAX_LINE_TOTAL);
    if (nums.length > 0) return nums[nums.length - 1];
  }
  return null;
}

function extractVatAmount(text: string, lines: string[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/מע[\"']?מ\s*\d+\s*%/i.test(lines[i])) continue;
    if (!/מע[\"']?מ|מעמ/i.test(lines[i])) continue;
    const nums = tokenizeNumbers(lines[i]).filter((n) => n < 50_000 && !isLongIdNumber(n));
    if (nums.length > 0) return nums[nums.length - 1];
  }
  return extractAmountByKeywords(text, HEBREW_VAT);
}

function extractSupplier(lines: string[], fullText: string): string {
  const byKey = extractAfterKeyword(fullText, HEBREW_SUPPLIER_HINT);
  if (byKey) return byKey.slice(0, 80).trim();
  for (const line of lines.slice(0, 15)) {
    if (/בע[\"']?מ|בע״מ|ltd/i.test(line) && letterCount(line) >= 4) {
      const cleaned = line
        .replace(/ח\.?\s*פ.*$/i, "")
        .replace(/עוסק.*$/i, "")
        .trim();
      if (cleaned.length >= 3) return cleaned.slice(0, 80);
    }
  }
  return "";
}

function extractDocumentType(text: string): string | undefined {
  if (/חשבונית\s*מס/.test(text)) return "חשבונית מס";
  return undefined;
}

function estimateConfidence(doc: Omit<ScannedDocument, "confidence">): number {
  const checks = [
    Boolean(doc.supplierRawName),
    Boolean(doc.invoiceNumber),
    Boolean(doc.date),
    doc.total != null && doc.total > 0,
    doc.items.length > 0,
  ];
  const base = checks.filter(Boolean).length / checks.length;
  const itemAvg =
    doc.items.length > 0
      ? doc.items.reduce((s, i) => s + (i.confidenceScore ?? 0.7), 0) / doc.items.length
      : 0;
  return Math.max(0.1, Math.min(1, base * 0.65 + itemAvg * 0.35));
}

export function summarizeParsed(doc: ScannedDocument): Record<string, unknown> {
  return {
    supplierRawName: doc.supplierRawName,
    invoiceNumber: doc.invoiceNumber,
    date: doc.date,
    total: doc.total,
    vatAmount: doc.vatAmount,
    itemsCount: doc.items.length,
    itemsPreview: doc.items.slice(0, 5).map((i) => ({
      name: i.rawName,
      qty: i.quantity,
      price: i.unitPrice,
    })),
    skippedLinesCount: doc.skippedLinesCount,
    rawTextLength: doc.rawText?.length ?? 0,
  };
}

export function parseReceiptText(
  rawText: string,
  options?: ParseReceiptOptions,
): ScannedDocument & { parseMeta?: ParseReceiptMeta } {
  const text = normalizeOcrText(rawText ?? "");
  const lines = splitLines(text);
  const overlay = options?.overlay ?? [];

  console.log("[PARSER] lines count:", lines.length, "overlay:", overlay.length);

  const structured = parseStructuredInvoice(text, overlay);
  const hdr = structured.header;

  let items = structured.items;
  let skipped = structured.skipped;
  let headerFound = structured.headerFound;
  let parseSource: ParseReceiptMeta["parseSource"] = structured.parseSource;
  let columnBands = structured.columnBands;

  const overlayUsable = overlay.length >= 3;

  if (items.length === 0 && !overlayUsable && !isLayoutOnlyMode()) {
    const legacy = extractTableItems(lines);
    if (legacy.items.length > 0) {
      items = legacy.items;
      skipped = legacy.skipped;
      parseSource = "legacy";
      console.log("[PARSER] legacy RTL table items:", items.length);
    }
  }

  const fb = isLayoutOnlyMode()
    ? { supplierRawName: "", invoiceNumber: "", date: "", total: null, vatAmount: null, documentType: "" }
    : extractHebrewInvoiceFields(text, lines);
  const fbItems = isLayoutOnlyMode() ? [] : parseFallbackLineItems(lines);
  if (items.length === 0 && fbItems.length > 0 && !overlayUsable && !isLayoutOnlyMode()) {
    items = fbItems;
    parseSource = "fallback";
    console.log("[PARSER] vertical fallback items:", fbItems.length);
  }

  const supplierRawName =
    hdr.supplierRawName ||
    extractSupplier(lines, text) ||
    fb.supplierRawName ||
    "";
  const invoiceNumber =
    hdr.invoiceNumber || extractInvoiceNumber(text) || fb.invoiceNumber || "";
  const date = hdr.date || extractDate(text) || fb.date || "";
  const time = extractTime(text);
  const total = hdr.total ?? extractTotal(text, lines) ?? fb.total ?? null;
  const vat = hdr.vatAmount ?? extractVatAmount(text, lines) ?? fb.vatAmount ?? null;
  const documentType = hdr.documentType || extractDocumentType(text) || fb.documentType;
  const invoiceKind = hdr.invoiceKind;
  const needsReviewFields = hdr.needsReview;

  console.log("[PARSER] table header found:", headerFound, "source:", parseSource);
  console.log("[OCR PARSED RESULT]", {
    itemsCount: items.length,
    parseSource,
    headerFound,
    columnBands,
    itemsPreview: items.slice(0, 5).map((i) => ({
      name: i.rawName,
      qty: i.quantity,
      price: i.unitPrice,
      total: i.lineTotal,
      conf: i.parseConfidence ?? i.confidenceScore,
    })),
  });

  const draft: Omit<ScannedDocument, "confidence"> = {
    supplierRawName,
    supplierName: supplierRawName,
    supplierId: null,
    invoiceNumber,
    date,
    time: time || undefined,
    documentType,
    invoiceKind,
    fieldConfidence: {
      supplier: hdr.supplierConfidence,
      invoiceNumber: hdr.invoiceNumberConfidence,
      date: hdr.dateConfidence,
      total: hdr.totalConfidence,
      invoiceKind: hdr.invoiceKindConfidence,
    },
    needsReviewFields: needsReviewFields.length > 0 ? needsReviewFields : undefined,
    vatAmount: vat,
    total,
    items,
    skippedLinesCount: skipped,
    rawText: text,
    engine: "parser-structured",
    receiptFileUrl: null,
    receiptFileName: null,
  };

  return {
    ...draft,
    confidence: estimateConfidence(draft),
    parseMeta: {
      parseSource,
      headerFound,
      columnBands,
      overlayLineCount: overlay.length,
      invoiceKind,
      needsReviewFields,
    },
  };
}

/** @deprecated use tokenizeNumbers — kept for tests */
export function extractNumbers(line: string): number[] {
  if (isExcludedLine(line)) return [];
  return tokenizeNumbers(line).filter((n) => !isLongIdNumber(n) && n <= MAX_UNIT_PRICE);
}
