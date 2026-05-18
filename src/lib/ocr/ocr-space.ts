/**
 * OCR.space REST client — multipart/form-data only (never JSON body).
 * @see https://ocr.space/ocrapi
 */

import { mapOcrSpaceMessageToCode, OcrServiceError } from "./ocr-errors";

export type OcrSpaceResult = {
  rawText: string;
  lines: string[];
  confidence: number;
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

function normalizeOcrSpaceResponse(json: OcrSpaceApiResponse): OcrSpaceResult {
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

  const rawText = pageTexts.join("\n\n").trim() || lines.join("\n").trim();

  const finalLines =
    lines.length > 0
      ? lines
      : rawText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

  const confidence =
    confN > 0
      ? Math.min(1, confSum / confN / 100)
      : rawText
        ? json.OCRExitCode === 1
          ? 0.85
          : 0.65
        : 0;

  return { rawText, lines: finalLines, confidence };
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
  formData.append("OCREngine", "1");

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  formData.append("file", blob, fileName);

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
): Promise<OcrPostResult> {
  const formData = buildOcrFormData(apiKey, language, buffer, mimeType, fileName);

  console.log("[OCR] OCR request start", {
    provider: "ocr.space",
    language,
    mimeType,
    bytes: buffer.length,
    fileName,
    contentType: "multipart/form-data (auto boundary)",
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

    const result = normalizeOcrSpaceResponse(json);
    result.rawApiResponse = bodyText;
    console.log(
      "[OCR] RESPONSE confidence:",
      result.confidence,
      "language:",
      language,
      "lines:",
      result.lines.length,
    );
    if (result.rawText.length > 0) {
      console.log("[OCR] OCR text preview:", result.rawText.slice(0, 400));
    }
    return result;
  }

  throw new OcrServiceError("OCR_PROVIDER_ERROR", lastError);
}
