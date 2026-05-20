/**
 * Google Cloud Vision — documentTextDetection with he/ar/en hints.
 * Hard verify: API key only, pages + word coordinates, no flat-text fallback.
 */
import { OcrServiceError } from "./ocr-errors";
import { buildRawTextFromOverlay, type OcrPositionedLine } from "./ocr-overlay";
import { mergeOcrConfidence } from "./ocr-quality";
import { normalizeRtlDocument } from "./rtl-document-normalize";
import {
  assertGoogleVisionHardRequirements,
  googleVisionApiKeyPresent,
  isGoogleOnlyMode,
  logGoogleVisionKeyCheck,
  logOcrProviderActive,
} from "./ocr-hard-verify";
import {
  countVisionBlocks,
  countVisionPages,
  detectLanguagesFromVisionText,
  extractOverlayFromVisionResponse,
  sampleVisionWords,
  type VisionWordSample,
} from "./vision-overlay";

export type GoogleVisionResult = {
  rawText: string;
  lines: string[];
  confidence: number;
  overlay: OcrPositionedLine[];
  ocrLanguage: string;
  ocrEngine: string;
  rawApiResponse: string;
  blockCount: number;
  pageCount: number;
  detectedLanguages: string[];
  needsManualReview: boolean;
  visionWordsSample: VisionWordSample[];
};

const LANGUAGE_HINTS = ["he", "ar", "en"] as const;

export function googleVisionConfigured(): boolean {
  if (isGoogleOnlyMode()) return googleVisionApiKeyPresent();
  if (googleVisionApiKeyPresent()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()) return true;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return true;
  return false;
}

async function annotateWithApiKey(buffer: Buffer): Promise<{ rawJson: string }> {
  const key = process.env.GOOGLE_CLOUD_VISION_API_KEY!.trim();
  const base64 = buffer.toString("base64");
  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints: [...LANGUAGE_HINTS] },
      },
    ],
  };

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000),
    },
  );

  const rawJson = await res.text();
  if (!res.ok) {
    throw new OcrServiceError(
      "OCR_PROVIDER_ERROR",
      `Google Vision HTTP ${res.status}: ${rawJson.slice(0, 400)}`,
    );
  }
  return { rawJson };
}

type VisionResponseShape = {
  fullTextAnnotation?: {
    pages?: unknown[];
  };
  error?: { message?: string };
};

function parseVisionPayload(rawJson: string): {
  overlay: OcrPositionedLine[];
  blockCount: number;
  pageCount: number;
  engineConfidence: number;
  visionWordsSample: VisionWordSample[];
} {
  const parsed = JSON.parse(rawJson) as {
    responses?: VisionResponseShape[];
    fullTextAnnotation?: VisionResponseShape["fullTextAnnotation"];
  };

  const response =
    parsed.responses?.[0] ??
    (parsed.fullTextAnnotation ? { fullTextAnnotation: parsed.fullTextAnnotation } : null);

  if (!response) {
    throw new OcrServiceError("OCR_PROVIDER_ERROR", "Google Vision: empty response");
  }
  if (response.error?.message) {
    throw new OcrServiceError("OCR_PROVIDER_ERROR", response.error.message);
  }

  const annotation = response.fullTextAnnotation as NonNullable<
    Parameters<typeof countVisionPages>[0]
  >;
  const pageCount = countVisionPages(annotation);
  console.log("[OCR HARD VERIFY] fullTextAnnotation.pages.length:", pageCount);

  if (pageCount === 0) {
    throw new OcrServiceError(
      "OCR_PROVIDER_ERROR",
      "Google Vision returned no pages — OCR did not run correctly",
    );
  }

  const visionWordsSample = sampleVisionWords(annotation, 10);
  console.log("[OCR HARD VERIFY] first 10 words (text, x, y):");
  for (const w of visionWordsSample) {
    console.log(`  "${w.text}" @ x=${w.x} y=${w.y}`);
  }

  const overlay = extractOverlayFromVisionResponse(
    response as Parameters<typeof extractOverlayFromVisionResponse>[0],
  );

  if (overlay.length === 0 || visionWordsSample.length === 0) {
    throw new OcrServiceError(
      "OCR_PROVIDER_ERROR",
      "Google Vision returned pages but no word coordinates — layout parser cannot run",
    );
  }

  const blockCount = countVisionBlocks(annotation);
  const confidences = overlay.flatMap((l) =>
    l.words.map((w) => w.confidence).filter((c): c is number => c != null && c > 0),
  );
  const engineConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : overlay.length > 5
        ? 0.72
        : 0.55;

  return {
    overlay,
    blockCount,
    pageCount,
    engineConfidence,
    visionWordsSample,
  };
}

export async function runGoogleVision(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<GoogleVisionResult> {
  if (isGoogleOnlyMode()) {
    assertGoogleVisionHardRequirements();
  } else if (!googleVisionConfigured()) {
    throw new OcrServiceError("OCR_NOT_CONFIGURED", "Google Vision is not configured");
  }

  logOcrProviderActive("google_vision");
  console.log("[OCR REQUEST] google_vision", {
    fileName,
    mimeType,
    bytes: buffer.length,
    languageHints: LANGUAGE_HINTS,
    apiKeyPresent: googleVisionApiKeyPresent(),
  });

  const start = Date.now();
  let rawJson: string;

  try {
    if (!googleVisionApiKeyPresent()) {
      logGoogleVisionKeyCheck();
      throw new OcrServiceError(
        "OCR_NOT_CONFIGURED",
        "Google Vision not configured — set GOOGLE_CLOUD_VISION_API_KEY",
      );
    }
    ({ rawJson } = await annotateWithApiKey(buffer));
  } catch (e) {
    if (e instanceof OcrServiceError) throw e;
    const msg = e instanceof Error ? e.message : "Google Vision failed";
    throw new OcrServiceError("OCR_PROVIDER_ERROR", msg);
  }

  const {
    overlay,
    blockCount,
    pageCount,
    engineConfidence,
    visionWordsSample,
  } = parseVisionPayload(rawJson);

  const fromOverlay = buildRawTextFromOverlay(overlay);
  const normalized = normalizeRtlDocument(fromOverlay);
  const detectedLanguages = detectLanguagesFromVisionText(normalized);
  const confidence = mergeOcrConfidence(engineConfidence, normalized);
  const needsManualReview = confidence < 0.42 || normalized.length < 12;
  const lines = overlay.map((l) => l.text).filter(Boolean);

  console.log("[OCR RESPONSE] google_vision", {
    ms: Date.now() - start,
    pageCount,
    blockCount,
    overlayLines: overlay.length,
    wordSamples: visionWordsSample.length,
    confidence,
    detectedLanguages,
  });

  return {
    rawText: normalized,
    lines,
    confidence,
    overlay,
    ocrLanguage: detectedLanguages.join("+"),
    ocrEngine: "google_vision",
    rawApiResponse: rawJson.slice(0, 120_000),
    blockCount,
    pageCount,
    detectedLanguages,
    needsManualReview,
    visionWordsSample,
  };
}
