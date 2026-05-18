const HEBREW_CHUNK_RE = /[\u0590-\u05FF]+/g;
/** Fix common OCR reversal inside Hebrew tokens (e.g. םולש → שלום). */
function reverseHebrewToken(token: string): string {
  return [...token].reverse().join("");
}

function looksReversedHebrew(token: string): boolean {
  if (token.length < 3) return false;
  const commonEnd = "םןךףץ";
  const commonStart = "שבכלמ";
  return commonEnd.includes(token[0]) && commonStart.includes(token[token.length - 1]);
}

/** Per-line RTL cleanup + symbol strip. */
export function fixRtlLineText(line: string): string {
  let s = line
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[|¦]/g, " ")
    .replace(/[^\S\n]+/g, " ");

  s = s.replace(HEBREW_CHUNK_RE, (chunk) => {
    if (looksReversedHebrew(chunk)) return reverseHebrewToken(chunk);
    return chunk;
  });

  return s.replace(/\s+/g, " ").trim();
}

/** Merge single-letter Hebrew fragments: "ש ל ו ם" patterns left as-is; join broken Latin. */
function mergeFragmentedWords(line: string): string {
  return line
    .replace(/([א-ת])\s+([א-ת])\s+([א-ת])\s+([א-ת])/g, "$1$2$3$4")
    .replace(/([a-zA-Z])\s+(?=[a-zA-Z]{1,2}\b)/g, "$1");
}

/**
 * Step 1 — Normalize OCR output before Hebrew invoice parsing.
 */
export function normalizeOcrText(raw: string): string {
  const lines = (raw ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => mergeFragmentedWords(fixRtlLineText(l)))
    .filter(Boolean);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Split into lines; preserve table rows (don't collapse spaces inside line). */
export function splitOcrLines(raw: string): string[] {
  const text = normalizeOcrText(raw);
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.replace(/\t+/g, " ").replace(/[ ]{2,}/g, "  ").trim();
    if (t.length > 0) out.push(t);
  }
  return out;
}
