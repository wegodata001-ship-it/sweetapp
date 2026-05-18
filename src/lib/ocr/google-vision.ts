import type { OcrEngineResult } from "./types";

/**
 * Google Cloud Vision REST client.
 *
 * Uses an API key from `GOOGLE_VISION_API_KEY` (or `GOOGLE_CLOUD_VISION_API_KEY`).
 * Images are sent to `images:annotate` (DOCUMENT_TEXT_DETECTION) and PDFs to
 * `files:annotate` (inline up to 5 MB; PDFs larger than that should be uploaded
 * to GCS first — out of scope for this minimal integration).
 *
 * No SDK dependency — uses raw fetch.
 */

const VISION_BASE = "https://vision.googleapis.com/v1";

function getApiKey(): string | null {
  const key =
    process.env.GOOGLE_VISION_API_KEY?.trim() ||
    process.env.GOOGLE_CLOUD_VISION_API_KEY?.trim() ||
    "";
  return key || null;
}

export function googleVisionConfigured(): boolean {
  return Boolean(getApiKey());
}

type VisionAnnotateResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: { message?: string };
  }>;
};

type VisionFilesAnnotateResponse = {
  responses?: Array<{
    responses?: Array<{
      fullTextAnnotation?: { text?: string };
      error?: { message?: string };
    }>;
    error?: { message?: string };
  }>;
};

function pickTextFromResponse(json: VisionAnnotateResponse): string {
  const r = json.responses?.[0];
  if (!r) return "";
  if (r.error?.message) {
    throw new Error(`Vision API error: ${r.error.message}`);
  }
  if (r.fullTextAnnotation?.text) return r.fullTextAnnotation.text;
  const first = r.textAnnotations?.[0]?.description;
  return first ?? "";
}

function pickTextFromFilesResponse(json: VisionFilesAnnotateResponse): string {
  const top = json.responses?.[0];
  if (!top) return "";
  if (top.error?.message) {
    throw new Error(`Vision API error: ${top.error.message}`);
  }
  const inner = top.responses ?? [];
  const parts: string[] = [];
  for (const p of inner) {
    if (p.error?.message) {
      throw new Error(`Vision API error: ${p.error.message}`);
    }
    if (p.fullTextAnnotation?.text) parts.push(p.fullTextAnnotation.text);
  }
  return parts.join("\n").trim();
}

/**
 * Run OCR on a file buffer.
 *
 * - For images (jpg/png/webp), uses `images:annotate` with
 *   `DOCUMENT_TEXT_DETECTION` and Hebrew/Arabic/English language hints.
 * - For PDFs, uses `files:annotate` with the same feature.
 * - Throws when the API key is missing or the request fails.
 */
export async function runGoogleVisionOcr(
  buffer: Buffer,
  mimeType: string,
): Promise<OcrEngineResult> {
  const key = getApiKey();
  if (!key) {
    throw new Error("GOOGLE_VISION_API_KEY is not configured");
  }
  const content = buffer.toString("base64");
  const languageHints = ["he", "ar", "en"];

  if (mimeType === "application/pdf") {
    const url = `${VISION_BASE}/files:annotate?key=${encodeURIComponent(key)}`;
    const body = {
      requests: [
        {
          inputConfig: {
            mimeType: "application/pdf",
            content,
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints },
        },
      ],
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Vision (PDF) HTTP ${res.status}: ${errBody.slice(0, 400)}`);
    }
    const json = (await res.json()) as VisionFilesAnnotateResponse;
    const text = pickTextFromFilesResponse(json);
    return { text, engine: "google_vision_pdf", confidence: text ? 0.9 : 0 };
  }

  const url = `${VISION_BASE}/images:annotate?key=${encodeURIComponent(key)}`;
  const body = {
    requests: [
      {
        image: { content },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        imageContext: { languageHints },
      },
    ],
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Vision (image) HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const json = (await res.json()) as VisionAnnotateResponse;
  const text = pickTextFromResponse(json);
  return { text, engine: "google_vision_image", confidence: text ? 0.9 : 0 };
}
