/**
 * Step 1 — Normalize OCR output before Hebrew invoice parsing.
 */
export function normalizeOcrText(raw: string): string {
  return (raw ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n{2}/g, "\n")
    .trim();
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
