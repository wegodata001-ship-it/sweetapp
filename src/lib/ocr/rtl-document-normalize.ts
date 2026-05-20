/**
 * RTL normalization after OCR — fix Hebrew direction without breaking numbers/prices.
 */
import { normalizeHebrewOCR } from "./normalize-hebrew-ocr";

const BIDI_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const HEBREW_RE = /[\u0590-\u05FF]/;
const HEBREW_CHUNK_RE = /[\u0590-\u05FF]+/g;
const PRICE_TOKEN_RE = /^\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?$|^\d+\.\d{2}$/;
const DIGIT_HEAVY_RE = /\d.*\d/;

const finalForms = "םןךףץ";
const startLetters = "אבגדהוזחטיכלמנסעפצקרשת";

function reverseHebrewToken(token: string): string {
  return [...token].reverse().join("");
}

function looksReversedHebrew(token: string): boolean {
  if (token.length < 3 || /\d/.test(token)) return false;
  return (
    finalForms.includes(token[0]) && startLetters.includes(token[token.length - 1])
  );
}

function stripBidi(s: string): string {
  return s.replace(BIDI_RE, "").replace(/\u00a0/g, " ");
}

/** Line has meaningful numbers — do not reverse Hebrew chunks (prices, qty, invoice #). */
function lineIsNumericHeavy(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits >= 6) return true;
  if (DIGIT_HEAVY_RE.test(t) && digits / t.length > 0.12) return true;
  const tokens = t.split(/\s+/);
  const priceLike = tokens.filter((tok) => PRICE_TOKEN_RE.test(tok.replace(/,/g, ""))).length;
  return priceLike >= 2 || (priceLike >= 1 && digits >= 4);
}

function fixHebrewChunksOnly(line: string): string {
  return stripBidi(line).replace(HEBREW_CHUNK_RE, (chunk) => {
    if (looksReversedHebrew(chunk)) return reverseHebrewToken(chunk);
    return chunk;
  });
}

/** Per-line RTL fix — numbers and decimal amounts stay LTR. */
export function normalizeRtlLine(line: string): string {
  if (!line?.trim()) return "";
  if (lineIsNumericHeavy(line)) {
    return fixHebrewChunksOnly(line).replace(/\s+/g, " ").trim();
  }
  if (!HEBREW_RE.test(line)) {
    return stripBidi(line).replace(/\s+/g, " ").trim();
  }
  return normalizeHebrewOCR(line);
}

export function normalizeRtlDocument(text: string): string {
  if (!text?.trim()) return "";
  return text
    .split(/\r?\n/)
    .map((line) => normalizeRtlLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
