/**
 * OCR.space REST client — serverless-safe (no local Tesseract).
 * @see https://ocr.space/ocrapi
 */

import { mapOcrSpaceMessageToCode, OcrServiceError } from "./ocr-errors";

export type OcrSpaceResult = {
  rawText: string;
  lines: string[];
  confidence: number;
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

export function ocrSpaceConfigured(): boolean {
  return Boolean(process.env.OCR_SPACE_API_KEY?.trim());
}

function getApiKey(): string {
  const key = process.env.OCR_SPACE_API_KEY?.trim();
  if (!key) throw new OcrServiceError("OCR_NOT_CONFIGURED", "OCR_SPACE_API_KEY is not configured");
  return key;
}

function mimeToFiletype(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "image/png":
      return "PNG";
    case "image/jpeg":
    case "image/jpg":
      return "JPG";
    default:
      return "JPG";
  }
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
 * Send image/PDF buffer to OCR.space (language=heb, table mode for invoices).
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

  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("language", "heb");
  form.append("isOverlayRequired", "true");
  form.append("detectOrientation", "true");
  form.append("isTable", "true");
  form.append("scale", "true");
  form.append("OCREngine", "1");
  form.append("filetype", mimeToFiletype(mimeType));

  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  const safeName =
    fileName?.trim() ||
    (mimeType === "application/pdf" ? "invoice.pdf" : "invoice.jpg");
  form.append("file", blob, safeName);

  console.log("[OCR] OCR request start", {
    provider: "ocr.space",
    mimeType,
    bytes: buffer.length,
    fileName: safeName,
  });

  const requestStart = Date.now();
  const res = await fetch(apiUrl, { method: "POST", body: form });
  const bodyText = await res.text();
  const requestMs = Date.now() - requestStart;

  console.log("[OCR] OCR response received", {
    httpStatus: res.status,
    ms: requestMs,
    bodyLen: bodyText.length,
    processingMs: (() => {
      try {
        const j = JSON.parse(bodyText) as OcrSpaceApiResponse;
        return j.ProcessingTimeInMilliseconds ?? null;
      } catch {
        return null;
      }
    })(),
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

  if (!res.ok) {
    const msg = collectErrorMessage(json) || `OCR.space HTTP ${res.status}`;
    throw new OcrServiceError(mapOcrSpaceMessageToCode(msg), msg);
  }

  const result = normalizeOcrSpaceResponse(json);
  console.log("[OCR] OCR confidence:", result.confidence, "lines:", result.lines.length);
  if (result.rawText.length > 0) {
    console.log("[OCR] OCR text preview:", result.rawText.slice(0, 400));
  }

  return result;
}
