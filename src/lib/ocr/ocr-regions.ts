import sharp from "sharp";

/** Relative vertical slices — Israeli invoice layout (supplier / table / totals). */
export const OCR_REGION_SLICES = [
  { id: "header", topPct: 0, heightPct: 0.3 },
  { id: "items", topPct: 0.24, heightPct: 0.5 },
  { id: "totals", topPct: 0.68, heightPct: 0.32 },
] as const;

export type OcrRegionId = (typeof OCR_REGION_SLICES)[number]["id"];

export type OcrRegionBuffer = { id: OcrRegionId; buffer: Buffer };

/**
 * Crop preprocessed page into header / items / totals (no full-page OCR).
 */
export async function extractOcrRegions(preprocessedPng: Buffer): Promise<OcrRegionBuffer[]> {
  const meta = await sharp(preprocessedPng).metadata();
  const width = meta.width ?? 1200;
  const height = meta.height ?? 1600;

  const out: OcrRegionBuffer[] = [];

  for (const slice of OCR_REGION_SLICES) {
    const top = Math.min(Math.floor(height * slice.topPct), height - 1);
    const regionHeight = Math.min(
      Math.floor(height * slice.heightPct),
      height - top,
    );
    if (regionHeight < 24) continue;

    const buffer = await sharp(preprocessedPng)
      .extract({ left: 0, top, width, height: regionHeight })
      .toBuffer();

    out.push({ id: slice.id, buffer });
  }

  console.log(
    "[OCR] regions:",
    out.map((r) => r.id).join(", "),
    `page=${width}x${height}`,
  );
  return out;
}
