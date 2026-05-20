/**
 * בניית שורות מחדש ממילים + קואורדינטות — לא סומכים על סדר מילים של OCR בטקסט שטוח.
 */
import { normalizeRtlLine } from "./rtl-document-normalize";
import type { OcrPositionedLine, OcrPositionedWord } from "./ocr-overlay";

function median(values: number[]): number {
  if (values.length === 0) return 12;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** קיבוץ מילים לשורות לפי Y — סובלנות לפי גובה תו ממוצע */
export function groupWordsIntoLinesAdaptive(
  words: OcrPositionedWord[],
): OcrPositionedLine[] {
  if (words.length === 0) return [];

  const sorted = [...words].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);
  const medianH = median(sorted.map((w) => w.height).filter((h) => h > 2));
  const tolerance = Math.max(8, medianH * 0.55);

  const rows: OcrPositionedWord[][] = [];
  let current: OcrPositionedWord[] = [sorted[0]];
  let refY = sorted[0].centerY;

  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (Math.abs(w.centerY - refY) <= tolerance) {
      current.push(w);
    } else {
      rows.push(current);
      current = [w];
      refY = w.centerY;
    }
  }
  rows.push(current);

  return rows.map((row) => {
    row.sort((a, b) => a.centerX - b.centerX);
    const tops = row.map((w) => w.top);
    const lefts = row.map((w) => w.left);
    const rights = row.map((w) => w.left + w.width);
    return {
      text: normalizeRtlLine(row.map((w) => w.text).join(" ")),
      words: row,
      top: Math.min(...tops),
      minLeft: Math.min(...lefts),
      maxRight: Math.max(...rights),
    };
  });
}

/** האם יש מספיק מילים ממוספרות לפרסור לפי עמודות */
export function overlayLayoutQuality(overlay: OcrPositionedLine[]): {
  usable: boolean;
  wordCount: number;
  avgWordsPerLine: number;
} {
  const wordCount = overlay.reduce((n, l) => n + l.words.length, 0);
  const avgWordsPerLine = overlay.length > 0 ? wordCount / overlay.length : 0;
  const usable = overlay.length >= 5 && wordCount >= 12 && avgWordsPerLine >= 1.8;
  return { usable, wordCount, avgWordsPerLine };
}

/**
 * משפר overlay: מחדש קיבוץ שורות מכל המילים (פותר שורות שבורות / מילים מחוברות).
 */
export function refineOverlayLines(overlay: OcrPositionedLine[]): OcrPositionedLine[] {
  const allWords = overlay.flatMap((l) => l.words);
  if (allWords.length < 8) return overlay;

  const rebuilt = groupWordsIntoLinesAdaptive(allWords);
  rebuilt.sort((a, b) => a.top - b.top || a.minLeft - b.minLeft);
  return rebuilt.length >= 3 ? rebuilt : overlay;
}
