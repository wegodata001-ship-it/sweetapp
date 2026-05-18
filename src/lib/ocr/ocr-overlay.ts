/**
 * OCR.space TextOverlay — word positions for column-aware table parsing.
 */

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
};

type OcrSpaceParsedResult = {
  TextOverlay?: { Lines?: OcrSpaceLineRaw[] } | null;
};

type OcrSpaceApiResponse = {
  ParsedResults?: OcrSpaceParsedResult[];
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function wordsFromLine(line: OcrSpaceLineRaw): OcrPositionedWord[] {
  const words: OcrPositionedWord[] = [];
  for (const w of line.Words ?? []) {
    const text = (w.WordText ?? "").trim();
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

export function extractOverlayFromOcrSpaceJson(
  json: OcrSpaceApiResponse,
): OcrPositionedLine[] {
  const out: OcrPositionedLine[] = [];
  for (const pr of json.ParsedResults ?? []) {
    for (const line of pr.TextOverlay?.Lines ?? []) {
      const words = wordsFromLine(line);
      if (words.length === 0) {
        const t = (line.LineText ?? "").trim();
        if (t) {
          out.push({
            text: t,
            words: [],
            top: num(line.MinTop),
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
        text: words.map((w) => w.text).join(" "),
        words,
        top: Math.min(...tops),
        minLeft: Math.min(...lefts),
        maxRight: Math.max(...rights),
      });
    }
  }
  return out;
}

export function parseOverlayFromRawResponse(
  rawResponse: string | null | undefined,
): OcrPositionedLine[] {
  if (!rawResponse?.trim()) return [];
  try {
    const json = JSON.parse(rawResponse) as OcrSpaceApiResponse;
    return extractOverlayFromOcrSpaceJson(json);
  } catch {
    return [];
  }
}
