import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type OcrDebugSnapshot = {
  runtime: "local" | "vercel";
  provider: string;
  ocrLanguage?: string;
  ocrEngine?: string;
  fromCache?: boolean;
  timestamp: string;
  rawText: string;
  overlayLineCount: number;
  overlayLines: { text: string; top: number; wordCount: number }[];
  parsedItems: unknown[];
  columnBands?: { kind: string; minX: number; maxX: number }[];
  headerFound?: boolean;
  parseSource?: string;
  rawApiResponsePreview?: string;
  blockCount?: number;
  detectedLanguages?: string[];
};

function runtimeLabel(): "local" | "vercel" {
  return process.env.VERCEL ? "vercel" : "local";
}

/**
 * Persist OCR debug JSON under tmp/ocr-debug/ (local always; prod when OCR_DEBUG=1).
 */
export async function writeOcrDebugSnapshot(
  snapshot: Omit<OcrDebugSnapshot, "runtime" | "timestamp">,
): Promise<string | null> {
  const enabled =
    process.env.OCR_DEBUG === "1" ||
    process.env.OCR_DEBUG === "true" ||
    !process.env.VERCEL;
  if (!enabled) return null;

  const runtime = runtimeLabel();
  const full: OcrDebugSnapshot = {
    ...snapshot,
    runtime,
    timestamp: new Date().toISOString(),
  };

  const dir = path.join(process.cwd(), "tmp", "ocr-debug");
  await mkdir(dir, { recursive: true });
  const base = runtime === "vercel" ? "prod-output" : "local-output";
  const filePath = path.join(dir, `${base}-${Date.now()}.json`);
  await writeFile(filePath, JSON.stringify(full, null, 2), "utf8");
  console.log("[OCR DEBUG] wrote", filePath);
  return filePath;
}
