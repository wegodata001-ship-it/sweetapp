import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Font layer for the unified PDF engine.
 *
 * Every glyph in every PDF comes from a font file bundled in this repo — nothing is
 * fetched at runtime and nothing relies on OS fonts. No single Noto file covers all of
 * our scripts (Noto Sans Hebrew has no Latin letters or digits; Noto Sans Arabic has no
 * ₪), so text is split per script and each piece is drawn with a font that actually
 * contains the glyph. Drawing Arabic with the Hebrew font is what produced the boxes.
 *
 * Arabic contextual shaping and ligatures are handled by fontkit inside pdf-lib:
 * `drawText` calls `font.layout()`, which runs the OpenType GSUB/GPOS features and also
 * returns glyphs of a right-to-left run already in visual order. So we must pass each
 * run in LOGICAL order and must not reverse characters ourselves.
 */

export type PdfFontWeight = "regular" | "bold";

/** Script families we own a font for. `latin` also carries digits, punctuation and currency. */
export type PdfScript = "latin" | "hebrew" | "arabic";

export const PDF_SCRIPTS: readonly PdfScript[] = ["latin", "hebrew", "arabic"];

const FONT_FILES: Record<PdfScript, Record<PdfFontWeight, string>> = {
  latin: { regular: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf" },
  hebrew: { regular: "NotoSansHebrew-Regular.ttf", bold: "NotoSansHebrew-Bold.ttf" },
  arabic: { regular: "NotoSansArabic-Regular.ttf", bold: "NotoSansArabic-Bold.ttf" },
};

/**
 * Next traces server files from the project root, so a cwd-relative path is the reliable
 * lookup. Several candidates are tried because cwd differs between `next dev`,
 * `next start` and a standalone/serverless bundle.
 */
function candidatePaths(file: string): string[] {
  const rels = [
    path.join("src", "lib", "pdf", "fonts", file),
    path.join(".next", "server", "src", "lib", "pdf", "fonts", file),
    path.join("public", "fonts", "pdf", file),
  ];
  const roots = [process.cwd(), path.join(process.cwd(), "..")];
  return roots.flatMap((root) => rels.map((rel) => path.join(root, rel)));
}

const bytesCache = new Map<string, Promise<Uint8Array>>();

/** Font files never change at runtime, so bytes are read once per process. */
function loadFontBytes(file: string): Promise<Uint8Array> {
  const cached = bytesCache.get(file);
  if (cached) return cached;

  const task = (async () => {
    const tried: string[] = [];
    for (const candidate of candidatePaths(file)) {
      tried.push(candidate);
      try {
        return new Uint8Array(await readFile(candidate));
      } catch {
        // try the next candidate
      }
    }
    throw new Error(
      `גופן PDF חסר: ${file}. נבדקו הנתיבים:\n${tried.join("\n")}`,
    );
  })();

  bytesCache.set(file, task);
  return task;
}

const coverageCache = new Map<string, Promise<Set<number>>>();

/**
 * The set of code points a font can actually render. Used to pick a font per character
 * instead of guessing, and to detect a missing glyph before it becomes a box in the PDF.
 */
function loadCoverage(file: string): Promise<Set<number>> {
  const cached = coverageCache.get(file);
  if (cached) return cached;

  const task = (async () => {
    const bytes = await loadFontBytes(file);
    // `fontkit.create` needs a Buffer view over the same bytes.
    const parsed = fontkit.create(Buffer.from(bytes)) as { characterSet: number[] };
    return new Set<number>(parsed.characterSet);
  })();

  coverageCache.set(file, task);
  return task;
}

export function fontFileFor(script: PdfScript, weight: PdfFontWeight): string {
  return FONT_FILES[script][weight];
}

/** Warms byte + coverage caches so the first PDF of a process is not the slow one. */
export async function preloadPdfFonts(): Promise<void> {
  await Promise.all(
    PDF_SCRIPTS.flatMap((script) =>
      (["regular", "bold"] as PdfFontWeight[]).map((weight) =>
        loadCoverage(fontFileFor(script, weight)),
      ),
    ),
  );
}

const HEBREW_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0590, 0x05ff], // Hebrew
  [0xfb1d, 0xfb4f], // Hebrew presentation forms
];

const ARABIC_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

const inRanges = (cp: number, ranges: ReadonlyArray<readonly [number, number]>) =>
  ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

/**
 * Script of a single code point. Digits, punctuation, spaces and currency signs are
 * "neutral": they belong to whichever font keeps the line visually consistent.
 */
export function scriptOfCodePoint(cp: number): PdfScript | "neutral" {
  if (inRanges(cp, HEBREW_RANGES)) return "hebrew";
  if (inRanges(cp, ARABIC_RANGES)) return "arabic";
  // Latin letters are the only strong LTR script we ship.
  const isLatinLetter =
    (cp >= 0x41 && cp <= 0x5a) ||
    (cp >= 0x61 && cp <= 0x7a) ||
    (cp >= 0xc0 && cp <= 0x24f);
  if (isLatinLetter) return "latin";
  return "neutral";
}

/**
 * Neutral characters resolve to Noto Sans first: it is the only bundled font holding
 * digits, ASCII punctuation and ₪/$/€ together, so numbers and money stay uniform no
 * matter which language surrounds them.
 */
const NEUTRAL_PREFERENCE: readonly PdfScript[] = ["latin", "hebrew", "arabic"];

export type FontResolution = { script: PdfScript; covered: boolean };

/** Whether one specific bundled face contains `cp`. */
export async function isCoveredBy(
  script: PdfScript,
  weight: PdfFontWeight,
  cp: number,
): Promise<boolean> {
  const coverage = await loadCoverage(fontFileFor(script, weight));
  return coverage.has(cp);
}

/**
 * Chooses the bundled font that can draw `cp`, falling back across families so a rare
 * character never silently becomes a box. `covered: false` means no bundled font has it.
 */
export async function resolveScriptForCodePoint(
  cp: number,
  weight: PdfFontWeight,
): Promise<FontResolution> {
  const own = scriptOfCodePoint(cp);
  const order: PdfScript[] =
    own === "neutral"
      ? [...NEUTRAL_PREFERENCE]
      : [own, ...PDF_SCRIPTS.filter((s) => s !== own)];

  for (const script of order) {
    const coverage = await loadCoverage(fontFileFor(script, weight));
    if (coverage.has(cp)) return { script, covered: true };
  }
  // Keep the document renderable; the caller reports it instead of crashing a P0 invoice.
  return { script: own === "neutral" ? "latin" : own, covered: false };
}

/** Embedded fonts belong to one PDFDocument, so each document gets its own lazy set. */
export class PdfFontSet {
  private readonly embedded = new Map<string, Promise<PDFFont>>();
  private readonly missing = new Set<number>();

  private constructor(private readonly doc: PDFDocument) {}

  static create(doc: PDFDocument): PdfFontSet {
    doc.registerFontkit(fontkit);
    return new PdfFontSet(doc);
  }

  /**
   * Fonts are embedded on first use, so a Hebrew-only document never carries the
   * ~240 KB Arabic face. Subsetting keeps only the glyphs actually drawn.
   */
  font(script: PdfScript, weight: PdfFontWeight): Promise<PDFFont> {
    const file = fontFileFor(script, weight);
    const cached = this.embedded.get(file);
    if (cached) return cached;

    const task = (async () => {
      const bytes = await loadFontBytes(file);
      return this.doc.embedFont(bytes, { subset: true });
    })();
    this.embedded.set(file, task);
    return task;
  }

  async fontForCodePoint(cp: number, weight: PdfFontWeight): Promise<PDFFont> {
    const { script, covered } = await resolveScriptForCodePoint(cp, weight);
    if (!covered) this.missing.add(cp);
    return this.font(script, weight);
  }

  /** Code points no bundled font could draw — surfaced by tests rather than shipped blind. */
  missingCodePoints(): number[] {
    return [...this.missing].sort((a, b) => a - b);
  }
}
