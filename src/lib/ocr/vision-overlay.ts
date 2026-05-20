/**
 * Google Cloud Vision fullTextAnnotation → positioned lines (OCR.space-compatible shape).
 */
import { normalizeRtlLine } from "./rtl-document-normalize";
import { groupWordsIntoLinesAdaptive } from "./overlay-line-rebuild";
import type { OcrPositionedLine, OcrPositionedWord } from "./ocr-overlay";

type Vertex = { x?: number | null; y?: number | null };
type BoundingPoly = { vertices?: Vertex[] | null };

type VisionSymbol = { text?: string | null; confidence?: number | null };
type VisionWord = {
  symbols?: VisionSymbol[] | null;
  boundingBox?: BoundingPoly | null;
  confidence?: number | null;
};
type VisionParagraph = { words?: VisionWord[] | null };
type VisionBlock = { paragraphs?: VisionParagraph[] | null };
type VisionPage = { blocks?: VisionBlock[] | null };
type VisionFullTextAnnotation = {
  text?: string | null;
  pages?: VisionPage[] | null;
};

type VisionAnnotateResponse = {
  fullTextAnnotation?: VisionFullTextAnnotation | null;
  textAnnotations?: { description?: string | null }[] | null;
};

function wordText(word: VisionWord): string {
  const parts = (word.symbols ?? []).map((s) => s.text ?? "").join("");
  return parts.trim();
}

function boxFromVertices(vertices: Vertex[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const xs = vertices.map((v) => Number(v.x ?? 0));
  const ys = vertices.map((v) => Number(v.y ?? 0));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function wordConfidence(word: VisionWord): number | undefined {
  const sym = word.symbols ?? [];
  const vals = sym
    .map((s) => s.confidence)
    .filter((c): c is number => typeof c === "number" && c > 0);
  if (vals.length > 0) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg <= 1 ? avg : avg / 100;
  }
  if (typeof word.confidence === "number" && word.confidence > 0) {
    return word.confidence <= 1 ? word.confidence : word.confidence / 100;
  }
  return undefined;
}

export function extractOverlayFromVisionAnnotation(
  annotation: VisionFullTextAnnotation | null | undefined,
): OcrPositionedLine[] {
  const words: OcrPositionedWord[] = [];

  for (const page of annotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          const raw = wordText(word);
          if (!raw) continue;
          const verts = word.boundingBox?.vertices ?? [];
          if (verts.length < 2) continue;
          const { left, top, width, height } = boxFromVertices(verts);
          words.push({
            text: normalizeRtlLine(raw),
            left,
            top,
            width,
            height,
            centerX: left + width / 2,
            centerY: top + height / 2,
            confidence: wordConfidence(word),
          });
        }
      }
    }
  }

  const lines = groupWordsIntoLinesAdaptive(words);
  lines.sort((a, b) => a.top - b.top || a.minLeft - b.minLeft);
  return lines;
}

export function extractOverlayFromVisionResponse(
  response: VisionAnnotateResponse,
): OcrPositionedLine[] {
  const overlay = extractOverlayFromVisionAnnotation(response.fullTextAnnotation);
  if (overlay.length > 0) return overlay;
  console.error(
    "[OCR HARD VERIFY] Vision returned no word blocks — refusing textAnnotations/description fallback",
  );
  return [];
}

export function countVisionPages(
  annotation: VisionFullTextAnnotation | null | undefined,
): number {
  return annotation?.pages?.length ?? 0;
}

export type VisionWordSample = { text: string; x: number; y: number };

/** 10 מילים ראשונות עם קואורדינטות — לא משתמש ב-fullTextAnnotation.text */
export function sampleVisionWords(
  annotation: VisionFullTextAnnotation | null | undefined,
  limit = 10,
): VisionWordSample[] {
  const out: VisionWordSample[] = [];
  for (const page of annotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const word of para.words ?? []) {
          const text = wordText(word);
          const verts = word.boundingBox?.vertices ?? [];
          if (!text || verts.length < 1) continue;
          const xs = verts.map((v) => Number(v.x ?? 0));
          const ys = verts.map((v) => Number(v.y ?? 0));
          out.push({
            text: normalizeRtlLine(text),
            x: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
            y: Math.round(ys.reduce((a, b) => a + b, 0) / ys.length),
          });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

export function countVisionBlocks(annotation: VisionFullTextAnnotation | null | undefined): number {
  let n = 0;
  for (const page of annotation?.pages ?? []) {
    n += page.blocks?.length ?? 0;
  }
  return n;
}

export function detectLanguagesFromVisionText(text: string): string[] {
  const langs: string[] = [];
  if (/[\u0590-\u05FF]/.test(text)) langs.push("he");
  if (/[\u0600-\u06FF]/.test(text)) langs.push("ar");
  if (/[a-zA-Z]/.test(text)) langs.push("en");
  return langs.length > 0 ? langs : ["unknown"];
}
