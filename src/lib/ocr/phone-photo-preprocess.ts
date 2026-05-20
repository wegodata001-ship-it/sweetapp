/**
 * עיבוד מקדים לצילומי טלפון בלבד — לא ל-PNG/PDF מהמערכת.
 */
export async function preprocessForPhonePhoto(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const before = buffer.length;

  const out = await sharp(buffer)
    .rotate()
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.1 })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  console.log("[OCR PREPROCESS] phone photo", { before, after: out.length });
  return out;
}
