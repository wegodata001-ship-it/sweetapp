import sharp from "sharp";

export const OCR_COMPRESS_THRESHOLD_BYTES = 900 * 1024;
export const TARGET_BYTES = 850 * 1024;

/** Resize + JPEG until under TARGET_BYTES. */
export async function compressImageBuffer(buffer: Buffer): Promise<Buffer> {
  let width = 1600;
  let quality = 82;
  let out = await sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (out.length > TARGET_BYTES && quality > 48) {
    quality -= 10;
    out = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  while (out.length > TARGET_BYTES && width > 720) {
    width = Math.floor(width * 0.85);
    out = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: Math.max(quality, 60), mozjpeg: true })
      .toBuffer();
  }

  return out;
}
