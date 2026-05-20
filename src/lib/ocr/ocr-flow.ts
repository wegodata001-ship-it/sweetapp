/** Single OCR provider — OCR.space only (no Tesseract). */
export const OCR_PROVIDER = "ocr.space" as const;

export function getOcrRuntime(): "local" | "vercel" {
  return process.env.VERCEL ? "vercel" : "local";
}

export function logOcrFlow(meta: Record<string, unknown>): void {
  console.log("[OCR FLOW]", {
    provider: OCR_PROVIDER,
    runtime: getOcrRuntime(),
    ...meta,
  });
}
