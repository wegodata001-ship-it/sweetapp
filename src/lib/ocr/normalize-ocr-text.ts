/**
 * Normalize OCR.space / eng-OCR output before parser (line breaks differ from local Tesseract).
 */
export function normalizeOcrText(raw: string): string {
  return (raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
