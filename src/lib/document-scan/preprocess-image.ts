import sharp from "sharp";

const COMPRESS_THRESHOLD_BYTES = 1024 * 1024; // 1MB
const TARGET_MIN_BYTES = 300 * 1024; // 300KB
const TARGET_MAX_BYTES = 900 * 1024; // 900KB

export type PreprocessedImage = {
  buffer: Buffer;
  mimeType: string;
};

function isJpegMime(mimeType: string): boolean {
  return mimeType === "image/jpeg" || mimeType === "image/jpg";
}

/** דחיסה אוטומטית ליעד 300KB–900KB */
async function compressImageToTarget(input: Buffer): Promise<Buffer> {
  let quality = 85;
  let out = await sharp(input).jpeg({ quality, mozjpeg: true }).toBuffer();

  while (out.length > TARGET_MAX_BYTES && quality > 45) {
    quality -= 8;
    out = await sharp(input).jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (out.length > TARGET_MAX_BYTES) {
    const meta = await sharp(input).metadata();
    let width = meta.width ?? 2400;
    while (out.length > TARGET_MAX_BYTES && width > 900) {
      width = Math.floor(width * 0.85);
      out = await sharp(input)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: Math.max(quality, 72), mozjpeg: true })
        .toBuffer();
    }
  }

  if (out.length < TARGET_MIN_BYTES && input.length > TARGET_MIN_BYTES) {
    return input.length <= TARGET_MAX_BYTES ? input : out;
  }

  return out;
}

/** עיבוד מקדים לפני Gemini — JPEG כברירת מחדל, בלי upscale ל-PNG. */
export async function preprocessImageForScan(
  buffer: Buffer,
  mimeType: string,
): Promise<PreprocessedImage> {
  const start = Date.now();
  const before = buffer.length;

  const meta = await sharp(buffer).metadata();
  const needsRotate = meta.orientation != null && meta.orientation !== 1;

  // JPEG תקין וקטן — ללא re-encode מיותר (שומר איכות + גודל)
  if (before < COMPRESS_THRESHOLD_BYTES && isJpegMime(mimeType) && !needsRotate) {
    console.log("OCR_PREPROCESS_MS", Date.now() - start, {
      before,
      after: before,
      format: "jpeg",
      skipped: "quality_ok",
    });
    return { buffer, mimeType: "image/jpeg" };
  }

  let out: Buffer;

  if (isJpegMime(mimeType)) {
    out = await sharp(buffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    if (before < COMPRESS_THRESHOLD_BYTES && out.length > before * 1.2) {
      out = buffer;
    }
  } else {
    // PNG / WebP / PDF render — המרה ל-JPEG (לא PNG grayscale שמנפח)
    out = await sharp(buffer).rotate().jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  }

  if (out.length > COMPRESS_THRESHOLD_BYTES) {
    const compressed = await compressImageToTarget(out);
    console.log("OCR_PREPROCESS_MS", Date.now() - start, {
      before,
      after: compressed.length,
      format: "jpeg",
      compressed: true,
      target: `${TARGET_MIN_BYTES}-${TARGET_MAX_BYTES}`,
    });
    return { buffer: compressed, mimeType: "image/jpeg" };
  }

  console.log("OCR_PREPROCESS_MS", Date.now() - start, {
    before,
    after: out.length,
    format: "jpeg",
  });
  return { buffer: out, mimeType: "image/jpeg" };
}
