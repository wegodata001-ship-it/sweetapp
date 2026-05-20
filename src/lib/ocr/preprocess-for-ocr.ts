/**
 * עיבוד מקדים לפני OCR — rotate, grayscale, contrast, sharpen.
 * לא משנה מספרים בטקסט (רק את הפיקסלים).
 */
export async function preprocessImageForOcr(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const before = buffer.length;

  const out = await sharp(buffer)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  console.log("[OCR PREPROCESS]", { before, after: out.length, format: "png" });
  return out;
}
