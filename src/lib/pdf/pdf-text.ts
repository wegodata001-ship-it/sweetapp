import type { PDFPage, RGB } from "pdf-lib";
import { PdfFontSet, type PdfFontWeight } from "./pdf-fonts";
import { shapeTextRuns, type PdfDirection, type TextRun } from "./pdf-i18n";
import { PDF_COLORS, lineHeightFor } from "./pdf-theme";

/**
 * Bidi-aware text drawing. Every string in every PDF goes through here, so no document has
 * to think about direction, alignment or which font holds a given script.
 *
 * A string is resolved into visually ordered runs, then each run is drawn with its own
 * font at a computed x offset. Runs keep logical character order so pdf-lib/fontkit
 * applies Arabic shaping and right-to-left glyph ordering inside the run.
 */

export type TextAlign = "start" | "end" | "center";

export type TextStyle = {
  size: number;
  weight?: PdfFontWeight;
  color?: RGB;
  /** Overrides the document direction for this string only. */
  direction?: PdfDirection;
};

export type MeasuredRun = TextRun & { width: number };

export type MeasuredText = {
  runs: MeasuredRun[];
  width: number;
};

/** Resolves runs and their widths without drawing, for layout decisions and wrapping. */
export async function measureText(
  fonts: PdfFontSet,
  text: string,
  style: TextStyle,
  direction: PdfDirection,
): Promise<MeasuredText> {
  const weight = style.weight ?? "regular";
  const runs = await shapeTextRuns(text, {
    direction: style.direction ?? direction,
    weight,
  });

  const measured: MeasuredRun[] = [];
  let width = 0;
  for (const run of runs) {
    const font = await fonts.font(run.script, run.weight);
    const runWidth = font.widthOfTextAtSize(run.text, style.size);
    measured.push({ ...run, width: runWidth });
    width += runWidth;
  }
  return { runs: measured, width };
}

/**
 * Resolves an alignment into a left edge inside `[x, x + boxWidth]`.
 * `start`/`end` follow the text direction, so a right-to-left document aligns to the
 * right without any document-level code doing the arithmetic.
 */
function leftEdgeFor(
  align: TextAlign,
  direction: PdfDirection,
  x: number,
  boxWidth: number,
  textWidth: number,
): number {
  const alignedRight = direction === "rtl" ? "start" : "end";
  if (align === "center") return x + (boxWidth - textWidth) / 2;
  if (align === alignedRight) return x + boxWidth - textWidth;
  return x;
}

export type DrawTextOptions = TextStyle & {
  /** Left edge of the box the text is aligned within. */
  x: number;
  /** Baseline y. */
  y: number;
  boxWidth: number;
  align?: TextAlign;
};

/** Draws one line of possibly mixed-script text. Returns the width actually drawn. */
export async function drawText(
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  direction: PdfDirection,
  options: DrawTextOptions,
): Promise<number> {
  if (!text) return 0;
  const measured = await measureText(fonts, text, options, direction);
  const color = options.color ?? PDF_COLORS.text;
  let cursor = leftEdgeFor(
    options.align ?? "start",
    options.direction ?? direction,
    options.x,
    options.boxWidth,
    measured.width,
  );

  for (const run of measured.runs) {
    const font = await fonts.font(run.script, run.weight);
    page.drawText(run.text, {
      x: cursor,
      y: options.y,
      size: options.size,
      font,
      color,
    });
    cursor += run.width;
  }
  return measured.width;
}

/**
 * Wraps text to `maxWidth`, breaking on spaces and falling back to per-character breaks
 * for long unbroken words. Measurement uses the same run/font resolution as drawing, so a
 * mixed Hebrew/Arabic/Latin line wraps where it visually actually overflows.
 */
export async function wrapText(
  fonts: PdfFontSet,
  text: string,
  style: TextStyle,
  direction: PdfDirection,
  maxWidth: number,
): Promise<string[]> {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines: string[] = [];

  for (const paragraph of normalized.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      const { width } = await measureText(fonts, candidate, style, direction);
      if (width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
      }

      const wordOnly = await measureText(fonts, word, style, direction);
      if (wordOnly.width <= maxWidth) {
        current = word;
        continue;
      }
      // A single word wider than the box still has to break somewhere.
      const pieces = await breakLongWord(fonts, word, style, direction, maxWidth);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? "";
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

async function breakLongWord(
  fonts: PdfFontSet,
  word: string,
  style: TextStyle,
  direction: PdfDirection,
  maxWidth: number,
): Promise<string[]> {
  const out: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = current + char;
    const { width } = await measureText(fonts, candidate, style, direction);
    if (width > maxWidth && current) {
      out.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  out.push(current);
  return out;
}

/** Draws wrapped text and returns the y baseline below the block. */
export async function drawParagraph(
  page: PDFPage,
  fonts: PdfFontSet,
  text: string,
  direction: PdfDirection,
  options: DrawTextOptions,
): Promise<number> {
  const lines = await wrapText(fonts, text, options, direction, options.boxWidth);
  const step = lineHeightFor(options.size);
  let y = options.y;
  for (const line of lines) {
    if (line) await drawText(page, fonts, line, direction, { ...options, y });
    y -= step;
  }
  return y;
}

/**
 * Truncates to `maxWidth` with an ellipsis, for table cells that must stay on one line.
 * Falls back to plain truncation when the ellipsis itself does not fit.
 */
export async function ellipsize(
  fonts: PdfFontSet,
  text: string,
  style: TextStyle,
  direction: PdfDirection,
  maxWidth: number,
): Promise<string> {
  const { width } = await measureText(fonts, text, style, direction);
  if (width <= maxWidth) return text;

  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = `${chars.slice(0, mid).join("")}…`;
    const measured = await measureText(fonts, candidate, style, direction);
    if (measured.width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${chars.slice(0, lo).join("")}…` : "";
}
