import bidiFactory from "bidi-js";
import { SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n/constants";
import {
  isCoveredBy,
  scriptOfCodePoint,
  type PdfFontWeight,
  type PdfScript,
  resolveScriptForCodePoint,
} from "./pdf-fonts";

/**
 * Direction and bidi layer for the unified PDF engine.
 *
 * A single `drawText` call cannot render mixed-direction text: fontkit shapes the whole
 * string with one dominant script, which is why "الفاتورة INV-00015" previously produced
 * .notdef glyphs. Here a string is resolved with the real Unicode Bidirectional Algorithm
 * and split into runs that are each uniform in direction AND font, so the drawing layer
 * can place them itself.
 */

const bidi = bidiFactory();

export type PdfDirection = "rtl" | "ltr";

export const RTL_LOCALES: readonly AppLocale[] = ["he", "ar"];

export function normalizePdfLocale(value: string | null | undefined): AppLocale {
  const raw = (value ?? "").trim().toLowerCase();
  const base = raw.split(/[-_]/)[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as AppLocale)
    : "he";
}

export function directionForLocale(locale: AppLocale): PdfDirection {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/** The font family a locale's own words should use, before per-character fallback. */
export function primaryScriptForLocale(locale: AppLocale): PdfScript {
  if (locale === "ar") return "arabic";
  if (locale === "he") return "hebrew";
  return "latin";
}

/**
 * One piece of text that is uniform in bidi level and font, in LOGICAL character order.
 * `level` is the resolved bidi embedding level (odd = right-to-left).
 */
export type TextRun = {
  text: string;
  script: PdfScript;
  weight: PdfFontWeight;
  level: number;
};

/**
 * Unicode Bidi Algorithm rule L2: reverse any contiguous sequence of runs at or above
 * each level, from the highest level down to the lowest odd level. Applying this to whole
 * runs (rather than characters) leaves each run in logical order, which is what fontkit
 * needs — it reverses the glyphs of a right-to-left run internally.
 */
function reorderRunsVisually<T extends { level: number }>(runs: T[]): T[] {
  if (runs.length < 2) return [...runs];

  let maxLevel = 0;
  let lowestOdd = Number.MAX_SAFE_INTEGER;
  for (const run of runs) {
    if (run.level > maxLevel) maxLevel = run.level;
    if (run.level % 2 === 1 && run.level < lowestOdd) lowestOdd = run.level;
  }
  if (lowestOdd === Number.MAX_SAFE_INTEGER) return [...runs];

  const out = [...runs];
  for (let level = maxLevel; level >= lowestOdd; level--) {
    let start = -1;
    for (let i = 0; i <= out.length; i++) {
      const atOrAbove = i < out.length && out[i].level >= level;
      if (atOrAbove && start === -1) start = i;
      else if (!atOrAbove && start !== -1) {
        const slice = out.slice(start, i).reverse();
        out.splice(start, slice.length, ...slice);
        start = -1;
      }
    }
  }
  return out;
}

export type ShapeOptions = {
  /** Base paragraph direction. Neutral text (digits, punctuation) aligns to this. */
  direction: PdfDirection;
  weight?: PdfFontWeight;
};

/**
 * Splits `text` into runs ordered left-to-right as they must appear on the page.
 *
 * Each run is uniform in bidi level and in font, and its characters stay in logical
 * order so pdf-lib/fontkit applies Arabic shaping and right-to-left glyph ordering.
 */
export async function shapeTextRuns(
  text: string,
  options: ShapeOptions,
): Promise<TextRun[]> {
  const weight = options.weight ?? "regular";
  if (!text) return [];

  const embedding = bidi.getEmbeddingLevels(text, options.direction);
  const { levels } = embedding;

  // Bidi may mirror paired characters such as brackets when direction flips.
  const mirrored = bidi.getMirroredCharactersMap(text, embedding);

  const chars = [...text];
  // `levels` is indexed by UTF-16 code unit, so track that offset alongside code points.
  let unitIndex = 0;
  const items: Array<{
    char: string;
    cp: number;
    level: number;
    own: PdfScript | "neutral";
  }> = [];
  for (const char of chars) {
    const cp = char.codePointAt(0) ?? 32;
    const level = levels[unitIndex] ?? (options.direction === "rtl" ? 1 : 0);
    items.push({ char: mirrored.get(unitIndex) ?? char, cp, level, own: scriptOfCodePoint(cp) });
    unitIndex += char.length;
  }

  /**
   * Spaces, digits and punctuation carry no script of their own. Letting them inherit the
   * script around them keeps a word's spacing metrics in one font and avoids splitting an
   * Arabic phrase into a run per word.
   */
  const neighbourScript = (index: number): PdfScript | null => {
    const level = items[index].level;
    for (let i = index - 1; i >= 0; i--) {
      if (items[i].level !== level) break;
      if (items[i].own !== "neutral") return items[i].own as PdfScript;
    }
    for (let i = index + 1; i < items.length; i++) {
      if (items[i].level !== level) break;
      if (items[i].own !== "neutral") return items[i].own as PdfScript;
    }
    return null;
  };

  const resolved: Array<{ char: string; level: number; script: PdfScript }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let script: PdfScript | null = null;
    if (item.own === "neutral") {
      const neighbour = neighbourScript(i);
      if (neighbour && (await isCoveredBy(neighbour, weight, item.cp))) script = neighbour;
    }
    if (!script) script = (await resolveScriptForCodePoint(item.cp, weight)).script;
    resolved.push({ char: item.char, level: item.level, script });
  }

  // Merge neighbours that share level and font into as few runs as possible.
  const logicalRuns: TextRun[] = [];
  for (const item of resolved) {
    const last = logicalRuns.at(-1);
    if (last && last.level === item.level && last.script === item.script) {
      last.text += item.char;
    } else {
      logicalRuns.push({ text: item.char, script: item.script, weight, level: item.level });
    }
  }

  return reorderRunsVisually(logicalRuns);
}

/** True when the string contains any strongly right-to-left character. */
export function containsRtl(text: string): boolean {
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if ((cp >= 0x0590 && cp <= 0x08ff) || (cp >= 0xfb1d && cp <= 0xfeff)) return true;
  }
  return false;
}
