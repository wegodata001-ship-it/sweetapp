import { normalizeHebrewOCR } from "./normalize-hebrew-ocr";

/** @deprecated use normalizeHebrewOCR */
export function fixRtlLineText(line: string): string {
  return normalizeHebrewOCR(line);
}

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
    .map((l) => mergeFragmentedWords(normalizeHebrewOCR(l)))
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
