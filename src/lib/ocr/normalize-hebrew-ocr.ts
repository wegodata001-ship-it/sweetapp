/**
 * Hebrew OCR normalization for OCR.space output (eng/heb garbling, RTL, junk tokens).
 */

const HEBREW_RE = /[\u0590-\u05FF]/;
const HEBREW_CHUNK_RE = /[\u0590-\u05FF]+/g;

/** Known OCR.space garbage when language=eng on Hebrew invoices. */
const GARBAGE_TOKEN_RE =
  /^(?:rruwn|pnyn|nnnun|nun+|no['\u2018\u2019`]*|@@@+|xxx+|---+|\.{3,}|[a-z]{2,5}[•·.]{0,2})$/i;

const JUNK_SYMBOLS_RE = /[@#*•·]{2,}|\.{4,}/g;

function reverseHebrewToken(token: string): string {
  return [...token].reverse().join("");
}

function looksReversedHebrew(token: string): boolean {
  if (token.length < 3) return false;
  const finalForms = "םןךףץ";
  const startLetters = "אבגדהוזחטיכלמנסעפצקרשת";
  return finalForms.includes(token[0]) && startLetters.includes(token[token.length - 1]);
}

/** Latin-only token with no vowels — typical eng-OCR misread of Hebrew. */
function isLatinGarbageToken(token: string): boolean {
  const t = token.trim();
  if (t.length < 2 || t.length > 12) return false;
  if (!/^[a-zA-Z][a-zA-Z'\u2019`.•\-]*$/.test(t)) return false;
  if (HEBREW_RE.test(t)) return false;
  if (GARBAGE_TOKEN_RE.test(t)) return true;
  if (/^[a-z]{2,10}$/i.test(t) && !/[aeiouAEIOU]/i.test(t)) return true;
  return false;
}

export function isOcrGarbageText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (GARBAGE_TOKEN_RE.test(t)) return true;
  if (JUNK_SYMBOLS_RE.test(t)) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.every(isLatinGarbageToken)) return true;
  if (tokens.length === 1 && isLatinGarbageToken(tokens[0])) return true;
  return false;
}

export function normalizeHebrewOCR(input: string): string {
  if (!input?.trim()) return "";

  let s = input
    .replace(/\uFEFF/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(JUNK_SYMBOLS_RE, " ")
    .replace(/[|¦]/g, " ")
    .replace(/[^\S\n\u0590-\u05FFa-zA-Z0-9.,\-'"״׳₪%]/g, " ");

  s = s.replace(HEBREW_CHUNK_RE, (chunk) => {
    if (/\d/.test(chunk)) return chunk;
    if (looksReversedHebrew(chunk)) return reverseHebrewToken(chunk);
    return chunk;
  });

  s = s
    .replace(/([א-ת])\s+(?=[א-ת]\s)/g, "")
    .replace(/([a-zA-Z])\s+(?=[a-zA-Z]{1,2}\b)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}

export function hebrewLetterRatio(text: string): number {
  const letters = text.match(/[a-zA-Z\u0590-\u05FF]/g) ?? [];
  if (letters.length === 0) return 0;
  const heb = letters.filter((c) => HEBREW_RE.test(c)).length;
  return heb / letters.length;
}
