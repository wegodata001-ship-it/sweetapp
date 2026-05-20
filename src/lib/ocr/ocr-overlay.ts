/**
 * OCR.space TextOverlay — word positions for column-aware table parsing.
 */
import { normalizeHebrewOCR } from "./normalize-hebrew-ocr";
import { extractOverlayFromVisionResponse } from "./vision-overlay";

export type OcrPositionedWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  confidence?: number;
};

export type OcrPositionedLine = {
  text: string;
  words: OcrPositionedWord[];
  top: number;
  minLeft: number;
  maxRight: number;
};

type OcrSpaceWordRaw = {
  WordText?: string;
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
  Confidence?: number;
};

type OcrSpaceLineRaw = {
  LineText?: string;
  Words?: OcrSpaceWordRaw[];
  MinTop?: number;
  MaxTop?: number;
  MaxHeight?: number;
};

type OcrSpaceParsedResult = {
  TextOverlay?: { Lines?: OcrSpaceLineRaw[] } | null;
  ParsedText?: string | null;
};

export type OcrSpaceApiResponse = {
  ParsedResults?: OcrSpaceParsedResult[];
  OCRExitCode?: number;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function wordsFromLine(line: OcrSpaceLineRaw): OcrPositionedWord[] {
  const words: OcrPositionedWord[] = [];
  for (const w of line.Words ?? []) {
    const raw = (w.WordText ?? "").trim();
    const text = normalizeHebrewOCR(raw);
    if (!text) continue;
    const left = num(w.Left);
    const top = num(w.Top);
    const width = num(w.Width, 1);
    const height = num(w.Height, 1);
    words.push({
      text,
      left,
      top,
      width,
      height,
      centerX: left + width / 2,
      centerY: top + height / 2,
      confidence:
        typeof w.Confidence === "number" && w.Confidence > 0
          ? w.Confidence / 100
          : undefined,
    });
  }
  words.sort((a, b) => a.centerX - b.centerX);
  return words;
}

/** Build readable line text from positioned words (LTR join; columns use X bands). */
function lineTextFromWords(words: OcrPositionedWord[]): string {
  if (words.length === 0) return "";
  return words.map((w) => w.text).join(" ");
}

export function extractOverlayFromOcrSpaceJson(
  json: OcrSpaceApiResponse,
): OcrPositionedLine[] {
  const out: OcrPositionedLine[] = [];
  for (const pr of json.ParsedResults ?? []) {
    for (const line of pr.TextOverlay?.Lines ?? []) {
      const words = wordsFromLine(line);
      const lineTop = num(line.MinTop, words[0]?.top ?? 0);

      if (words.length === 0) {
        const t = normalizeHebrewOCR(line.LineText ?? "");
        if (t) {
          out.push({
            text: t,
            words: [],
            top: lineTop,
            minLeft: 0,
            maxRight: 0,
          });
        }
        continue;
      }

      const tops = words.map((w) => w.top);
      const lefts = words.map((w) => w.left);
      const rights = words.map((w) => w.left + w.width);
      out.push({
        text: normalizeHebrewOCR(lineTextFromWords(words)),
        words,
        top: lineTop || Math.min(...tops),
        minLeft: Math.min(...lefts),
        maxRight: Math.max(...rights),
      });
    }
  }

  out.sort((a, b) => a.top - b.top || a.minLeft - b.minLeft);
  return out;
}

/** Primary text for header fields — prefer overlay lines over ParsedText. */
export function buildRawTextFromOverlay(overlay: OcrPositionedLine[]): string {
  return overlay
    .map((l) => l.text)
    .filter(Boolean)
    .join("\n");
}

export function parseOverlayFromRawResponse(
  rawResponse: string | null | undefined,
): OcrPositionedLine[] {
  if (!rawResponse?.trim()) return [];
  try {
    const json = JSON.parse(rawResponse) as OcrSpaceApiResponse & {
      responses?: Array<{
        fullTextAnnotation?: unknown;
        textAnnotations?: { description?: string }[];
      }>;
    };
    if (json.ParsedResults?.length) {
      return extractOverlayFromOcrSpaceJson(json);
    }
    const visionResp = json.responses?.[0];
    if (visionResp) {
      return extractOverlayFromVisionResponse(
        visionResp as Parameters<typeof extractOverlayFromVisionResponse>[0],
      );
    }
  } catch {
    return [];
  }
  return [];
}
