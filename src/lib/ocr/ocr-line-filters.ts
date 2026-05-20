import { isOcrGarbageText } from "./normalize-hebrew-ocr";

/**
 * Strict filters — not every OCR line is a product row.
 */

const SKIP_LINE_RE =
  /^(?:מע[\"']?מ|מעמ|סה[\"']?כ|סהכ|סך\s*הכל|סה[\"']?כ\s*לתשלום|סהכ\s*לתשלום|סה[\"']?כ\s*לפני|סהכ\s*לפני|הנחה|כולל\s*מע|לתשלום|טלפון|פקס|phone|fax|כתובת|address|עוסק\s*מורשה|ח\.?\s*פ|תאריך|שעה|חשבונית\s*מס|חשבון\s*מס|מספר\s*רכב|מס\s*רכב|ברקוד\s*[:：]?$)/i;

const FOOTER_RE =
  /סה[\"']?כ\s*לפני|סה[\"']?כ\s*לתשלום|סהכ\s*לתשלום|סך\s*הכל|כולל\s*מע[\"']?מ|^מע[\"']?מ\s|^הנחה\s|לאחר\s*הנחה|לפני\s*מע/i;

const TABLE_HEADER_RE =
  /מפתח\s*פריט|מק[\"']?ט|מקט|שם\s*פריט|תיאור|תאור|כמות|מחיר|מחיר\s*יח|פריט|%?\s*הנחה/i;

const MIN_LINE_LETTERS = 2;
const MIN_NAME_LETTERS = 2;
const MAX_SYMBOL_RATIO = 0.45;

export function letterCount(s: string): number {
  return (s.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/gi) ?? []).length;
}

export function symbolRatio(s: string): number {
  if (!s.length) return 1;
  const symbols = (s.match(/[^\w\u0590-\u05FF\s]/gi) ?? []).length;
  return symbols / s.length;
}

export function isFooterLine(line: string): boolean {
  return FOOTER_RE.test(line.trim());
}

export function isTableHeaderLine(line: string): boolean {
  if (!TABLE_HEADER_RE.test(line)) return false;
  const hits = [
    /מק[\"']?ט|מקט|פריט|תיאור|תאור/i.test(line),
    /כמות/i.test(line),
    /מחיר/i.test(line),
  ].filter(Boolean).length;
  return hits >= 2;
}

export function isMetaLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (SKIP_LINE_RE.test(t)) return true;
  if (isFooterLine(t)) return true;
  if (/^[\d\s.,\-₪%]+$/.test(t) && letterCount(t) === 0) return true;
  if (/\b05\d{8}\b/.test(t.replace(/\s/g, ""))) return true;
  if (/(?:טלפון|פקס|ברקוד|phone|fax)/i.test(t)) return true;
  if (/עוסק\s*מורשה|ח\.?\s*פ|מספר\s*לקוח|מספר\s*רכב/i.test(t)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(t) && letterCount(t) < 6) return true;
  if (/^[\s\d.,\-]*(כמות|מחיר|אריזות|מס\s*פריט|שם\s*פריט)[\s\d.,\-]*$/i.test(t)) {
    return true;
  }
  return false;
}

/** True when line should never become a line item. */
export function shouldSkipItemLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (isMetaLine(t)) return true;
  if (isTableHeaderLine(t)) return true;
  if (t.length < 4) return true;
  if (letterCount(t) < MIN_LINE_LETTERS && !/\d+\.\d{1,2}/.test(t)) return true;
  if (symbolRatio(t) > MAX_SYMBOL_RATIO) return true;
  if (/^(?:סה[\"']?כ|מע[\"']?מ|הנחה|לתשלום|חשבונית)/i.test(t) && letterCount(t) < 14) {
    return true;
  }
  return false;
}

export function isReadableProductName(name: string): boolean {
  const n = name.trim();
  if (isOcrGarbageText(n)) return false;
  if (letterCount(n) < MIN_NAME_LETTERS) return false;
  if (/^[\d\s.,\-₪%]+$/.test(n)) return false;
  if (symbolRatio(n) > MAX_SYMBOL_RATIO) return false;
  if (/^(?:מע[\"']?מ|סה[\"']?כ|הנחה|כמות|מחיר|לתשלום)\b/i.test(n)) return false;
  return true;
}

export function canAutoMatchProductName(rawName: string): boolean {
  if (!isReadableProductName(rawName)) return false;
  if (rawName.trim().length < 3) return false;
  const digitsOnly = rawName.replace(/[\s.,\-_/\\'"״]/g, "");
  if (digitsOnly.length > 0 && /^\d+$/.test(digitsOnly)) return false;
  return true;
}
