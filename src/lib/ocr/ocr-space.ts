/**
 * OCR.space REST client — multipart/form-data only (never JSON body).
 * @see https://ocr.space/ocrapi
 */

import { mapOcrSpaceMessageToCode, OcrServiceError } from "./ocr-errors";
import {
  buildRawTextFromOverlay,
  extractOverlayFromOcrSpaceJson,
  type OcrPositionedLine,
} from "./ocr-overlay";
import { normalizeRtlDocument, normalizeRtlLine } from "./rtl-document-normalize";
import { getOcrProvider, logOcrFlow } from "./ocr-flow";

export type OcrSpaceResult = {
  rawText: string;
  lines: string[];
  confidence: number;
  overlay: OcrPositionedLine[];
  ocrLanguage: string;
  ocrEngine: string;
  /** Truncated OCR.space JSON body for debug/cache */
  rawApiResponse?: string | null;
};

type OcrSpaceWord = {
  WordText?: string;
  Confidence?: number;
};

type OcrSpaceLine = {
  Words?: OcrSpaceWord[];
  LineText?: string;
};

type OcrSpaceParsedResult = {
  ParsedText?: string | null;
  FileParseExitCode?: number | string;
  ErrorMessage?: string | null;
  TextOverlay?: {
    Lines?: OcrSpaceLine[];
  } | null;
};

type OcrSpaceApiResponse = {
  OCRExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[] | null;
  ErrorDetails?: string | null;
  ProcessingTimeInMilliseconds?: string | number;
  ParsedResults?: OcrSpaceParsedResult[];
};

const DEFAULT_API_URL = "https://api.ocr.space/parse/image";

const SUPPORTED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
]);

/** OCR.space language codes to try (heb may fail on Engine 1 → E201). */
const LANGUAGE_ATTEMPTS = ["heb", "eng"] as const;

export function ocrSpaceConfigured(): boolean {
  return Boolean(process.env.OCR_SPACE_API_KEY?.trim());
}

function getApiKey(): string {
  const key = process.env.OCR_SPACE_API_KEY?.trim();
  if (!key) {
    throw new OcrServiceError("OCR_NOT_CONFIGURED", "OCR_SPACE_API_KEY is not configured");
  }
  return key;
}

function collectErrorMessage(json: OcrSpaceApiResponse): string {
  if (json.ErrorMessage) {
    return Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.filter(Boolean).join("; ")
      : String(json.ErrorMessage);
  }
  if (json.ErrorDetails) return String(json.ErrorDetails);
  for (const pr of json.ParsedResults ?? []) {
    if (pr.ErrorMessage) return String(pr.ErrorMessage);
  }
  return "OCR.space processing failed";
}

/** E201: language invalid (e.g. heb not supported on OCREngine 1). */
export function isInvalidLanguageError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /e201/i.test(message) ||
    (m.includes("language") && m.includes("invalid")) ||
    m.includes("parameter 'language'")
  );
}

function lineTextFromOverlay(line: OcrSpaceLine): string {
  if (line.LineText?.trim()) return line.LineText.trim();
  const words = line.Words?.map((w) => w.WordText?.trim()).filter(Boolean) ?? [];
  return words.join(" ").trim();
}

function normalizeOcrSpaceResponse(
  json: OcrSpaceApiResponse,
  language: string,
  ocrEngine: string,
): OcrSpaceResult {
  if (json.IsErroredOnProcessing || json.OCRExitCode === 2 || json.OCRExitCode === 3) {
    const msg = collectErrorMessage(json);
    throw new OcrServiceError(mapOcrSpaceMessageToCode(msg), msg);
  }

  const pageTexts: string[] = [];
  const lines: string[] = [];
  let confSum = 0;
  let confN = 0;

  for (const pr of json.ParsedResults ?? []) {
    const exit = Number(pr.FileParseExitCode);
    if (exit < 0 && pr.ErrorMessage) {
      throw new OcrServiceError(
        mapOcrSpaceMessageToCode(String(pr.ErrorMessage)),
        String(pr.ErrorMessage),
      );
    }

    const parsed = (pr.ParsedText ?? "").trim();
    if (parsed) pageTexts.push(parsed);

    for (const line of pr.TextOverlay?.Lines ?? []) {
      const text = lineTextFromOverlay(line);
      if (text) lines.push(text);
      for (const w of line.Words ?? []) {
        if (typeof w.Confidence === "number" && w.Confidence > 0) {
          confSum += w.Confidence;
          confN += 1;
        }
      }
    }
  }

  const overlay = extractOverlayFromOcrSpaceJson(json);
  const overlayText = buildRawTextFromOverlay(overlay);
  const parsedFallback = pageTexts.join("\n\n").trim() || lines.join("\n").trim();

  /** Overlay is authoritative for table parsing; ParsedText only for empty overlay. */
  const rawText = normalizeRtlDocument(
    overlayText.length > 20 ? overlayText : parsedFallback,
  );

  const finalLines =
    overlay.length > 0
      ? overlay.map((l) => l.text).filter(Boolean)
      : rawText
          .split(/\r?\n/)
          .map((l) => normalizeRtlLine(l))
          .filter(Boolean);

  const confidence =
    confN > 0
      ? Math.min(1, confSum / confN / 100)
      : rawText
        ? json.OCRExitCode === 1
          ? 0.85
          : 0.65
        : 0;

  if (language === "eng" && overlay.length > 0) {
    console.warn(
      "[OCR] language=eng — Hebrew invoice may parse poorly; set OCR_SPACE_ENGINE=2 or fix E201 for heb",
    );
  }

  return {
    rawText,
    lines: finalLines,
    confidence,
    overlay,
    ocrLanguage: language,
    ocrEngine,
  };
}

/**
 * Build multipart body — fetch must NOT set Content-Type (boundary auto).
 */
function buildOcrFormData(
  apiKey: string,
  language: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): FormData {
  const formData = new FormData();
  formData.append("apikey", apiKey);
  formData.append("language", language);
  formData.append("isTable", "true");
  const engine = process.env.OCR_SPACE_ENGINE?.trim() || "1";
  formData.append("OCREngine", engine);

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file", blob, fileName);

  return formData;
}

/** OCR.space קורא את הקובץ ישירות מ־Storage (אותו binary כמו שהועלה). */
function buildOcrFormDataFromUrl(
  apiKey: string,
  language: string,
  sourceUrl: string,
): FormData {
  const formData = new FormData();
  formData.append("apikey", apiKey);
  formData.append("language", language);
  formData.append("isTable", "true");
  const engine = process.env.OCR_SPACE_ENGINE?.trim() || "1";
  formData.append("OCREngine", engine);
  formData.append("url", sourceUrl);
  return formData;
}

type OcrPostResult = {
  httpStatus: number;
  json: OcrSpaceApiResponse;
  bodyText: string;
};

async function postToOcrSpace(
  apiUrl: string,
  apiKey: string,
  language: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  opts?: { sourceUrl?: string; fileHash?: string },
): Promise<OcrPostResult> {
  const useUrl = Boolean(opts?.sourceUrl?.trim());
  const formData = useUrl
    ? buildOcrFormDataFromUrl(apiKey, language, opts!.sourceUrl!)
    : buildOcrFormData(apiKey, language, buffer, mimeType, fileName);

  const ocrEngine = process.env.OCR_SPACE_ENGINE?.trim() || "1";
  console.log("[OCR PROVIDER]", getOcrProvider());
  console.log("[OCR REQUEST]", {
    provider: getOcrProvider(),
    ocrEngine,
    language,
    mime: mimeType,
    size: buffer.length,
    hash: opts?.fileHash ?? null,
    fileName,
    mode: useUrl ? "signed_url" : "direct_buffer",
  });

  const requestStart = Date.now();
  const res = await fetch(apiUrl, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type — fetch adds multipart boundary.
  });
  const bodyText = await res.text();

  console.log("[OCR] OCR response received", {
    language,
    httpStatus: res.status,
    ms: Date.now() - requestStart,
    bodyLen: bodyText.length,
  });

  let json: OcrSpaceApiResponse;
  try {
    json = JSON.parse(bodyText) as OcrSpaceApiResponse;
  } catch {
    throw new OcrServiceError(
      "OCR_PROVIDER_ERROR",
      `OCR.space returned non-JSON (HTTP ${res.status}): ${bodyText.slice(0, 200)}`,
    );
  }

  return { httpStatus: res.status, json, bodyText };
}

/**
 * Send image/PDF to OCR.space — heb first, eng fallback on E201.
 */
export async function runOcrSpace(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  opts?: { sourceUrl?: string; fileHash?: string },
): Promise<OcrSpaceResult> {
  if (!SUPPORTED_MIMES.has(mimeType)) {
    throw new OcrServiceError(
      "OCR_PROVIDER_ERROR",
      `OCR.space does not support mime type: ${mimeType}`,
    );
  }

  const apiKey = getApiKey();
  const apiUrl = process.env.OCR_SPACE_API_URL?.trim() || DEFAULT_API_URL;
  const safeName =
    fileName?.trim() ||
    (mimeType === "application/pdf" ? "invoice.pdf" : "invoice.jpg");

  let lastError = "OCR.space request failed";

  for (let i = 0; i < LANGUAGE_ATTEMPTS.length; i++) {
    const language = LANGUAGE_ATTEMPTS[i];
    const { httpStatus, json, bodyText } = await postToOcrSpace(
      apiUrl,
      apiKey,
      language,
      buffer,
      mimeType,
      safeName,
      opts,
    );

    const errMsg = collectErrorMessage(json);

    if (isInvalidLanguageError(errMsg) && language === "heb") {
      console.warn("[OCR] OCR.space E201 for language=heb → retry with eng");
      lastError = errMsg;
      continue;
    }

    if (!httpStatus || httpStatus >= 400) {
      throw new OcrServiceError(
        mapOcrSpaceMessageToCode(errMsg),
        errMsg || `OCR.space HTTP ${httpStatus}`,
      );
    }

    if (json.IsErroredOnProcessing) {
      if (isInvalidLanguageError(errMsg) && language === "heb") {
        lastError = errMsg;
        continue;
      }
      throw new OcrServiceError(mapOcrSpaceMessageToCode(errMsg), errMsg);
    }

    const ocrEngine = process.env.OCR_SPACE_ENGINE?.trim() || "1";
    const result = normalizeOcrSpaceResponse(json, language, ocrEngine);
    result.rawApiResponse = bodyText;
    logOcrFlow({
      ocrLanguage: language,
      ocrEngine,
      overlayLines: result.overlay.length,
      textLines: result.lines.length,
      confidence: result.confidence,
    });
    console.log("[OCR RAW TEXT]\n", result.rawText.slice(0, 2000));
    console.log("[OCR RAW LINES]", result.lines.length, "overlay:", result.overlay.length);
    return result;
  }

  throw new OcrServiceError("OCR_PROVIDER_ERROR", lastError);
}
