import type { RGB } from "pdf-lib";
import type { PdfLayout } from "./pdf-layout";
import {
  PDF_COLORS,
  PDF_FONT_SIZES,
  PDF_SPACING,
  lineHeightFor,
} from "./pdf-theme";
import { drawText, ellipsize, measureText, wrapText, type TextAlign } from "./pdf-text";

/**
 * Table renderer for the unified PDF engine.
 *
 * Columns are declared once in logical order (first column = first thing the reader sees)
 * and are mirrored automatically for a right-to-left document, so no document performs its
 * own direction arithmetic. Headers repeat on every page.
 */

export type PdfTableColumn<Row> = {
  header: string;
  /** Share of the table width. Normalised across all columns. */
  width: number;
  /** Cell text. Use the formatters in pdf-utils for numbers, money and dates. */
  value: (row: Row, index: number) => string;
  /** Defaults to `start`; numeric columns usually want `end`. */
  align?: TextAlign;
  color?: (row: Row) => RGB | undefined;
  /** Allow the cell to wrap onto several lines instead of being ellipsized. */
  wrap?: boolean;
};

export type PdfTableOptions<Row> = {
  columns: Array<PdfTableColumn<Row>>;
  rows: Row[];
  /** Shown instead of the table body when there are no rows. */
  emptyText?: string;
  zebra?: boolean;
  /**
   * Let a header that does not fit its column wrap onto a second line instead of
   * being ellipsized, growing the header row. Off by default so the existing
   * documents keep their exact header height.
   */
  wrapHeaders?: boolean;
};

/** A wrapped header may take at most this many lines before it is ellipsized. */
const MAX_HEADER_LINES = 2;

/** Header font sizes tried, largest first, before falling back to ellipsizing. */
const HEADER_SIZE_STEPS = [0, -0.5, -1, -1.5, -2];

/**
 * Wraps header text at spaces only. A header is never broken mid-word, because a
 * half word in a column title is unreadable — a word that does not fit is
 * reported so the caller can try a smaller size.
 */
async function wrapHeaderAtWords(
  layout: PdfLayout,
  header: string,
  size: number,
  maxWidth: number,
): Promise<{ lines: string[]; overflow: boolean }> {
  const style = { size, weight: "bold" } as const;
  const words = header.split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [""], overflow: false };

  const lines: string[] = [];
  let current = "";
  let overflow = false;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const { width } = await measureText(layout.fonts, candidate, style, layout.direction);
    if (width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    const alone = await measureText(layout.fonts, word, style, layout.direction);
    if (alone.width > maxWidth) overflow = true;
  }
  if (current) lines.push(current);
  return { lines, overflow };
}

/**
 * Picks the largest header size at which every header fits in at most
 * MAX_HEADER_LINES whole-word lines. If no size fits, the smallest one is used
 * and the overflowing lines are ellipsized.
 */
async function layOutWrappedHeaders<Row>(
  layout: PdfLayout,
  visualColumns: Array<PdfTableColumn<Row>>,
  widths: number[],
  pad: number,
  baseSize: number,
): Promise<{ size: number; lines: string[][] }> {
  let fallback: { size: number; lines: string[][] } | null = null;

  for (const step of HEADER_SIZE_STEPS) {
    const size = baseSize + step;
    const perColumn: string[][] = [];
    let fits = true;
    for (let i = 0; i < visualColumns.length; i++) {
      const boxWidth = widths[i] - pad * 2;
      const { lines, overflow } = await wrapHeaderAtWords(
        layout,
        visualColumns[i].header,
        size,
        boxWidth,
      );
      perColumn.push(lines);
      if (overflow || lines.length > MAX_HEADER_LINES) fits = false;
    }
    if (fits) return { size, lines: perColumn };
    fallback = { size, lines: perColumn };
  }

  const last = fallback ?? { size: baseSize, lines: [] };
  const trimmed: string[][] = [];
  for (let i = 0; i < last.lines.length; i++) {
    const boxWidth = widths[i] - pad * 2;
    const style = { size: last.size, weight: "bold" } as const;
    const lines = last.lines[i].slice(0, MAX_HEADER_LINES);
    if (last.lines[i].length > MAX_HEADER_LINES) {
      lines[MAX_HEADER_LINES - 1] = last.lines[i].slice(MAX_HEADER_LINES - 1).join(" ");
    }
    trimmed.push(
      await Promise.all(
        lines.map((line) => ellipsize(layout.fonts, line, style, layout.direction, boxWidth)),
      ),
    );
  }
  return { size: last.size, lines: trimmed };
}

export async function drawTable<Row>(
  layout: PdfLayout,
  options: PdfTableOptions<Row>,
): Promise<void> {
  const { columns, rows } = options;
  if (!columns.length) return;

  const rtl = layout.direction === "rtl";
  const totalWeight = columns.reduce((sum, c) => sum + c.width, 0) || 1;

  // Logical order for reading; visual order for drawing.
  const visualColumns = rtl ? [...columns].reverse() : columns;
  const widths = visualColumns.map((c) => (c.width / totalWeight) * layout.contentWidth);
  const offsets: number[] = [];
  let acc = layout.left;
  for (const w of widths) {
    offsets.push(acc);
    acc += w;
  }

  const headerSize = PDF_FONT_SIZES.tableHeader;
  const cellSize = PDF_FONT_SIZES.tableCell;
  const pad = PDF_SPACING.tableCellPadding;

  // Header text is identical on every page, so it is laid out once.
  let headerFontSize: number = headerSize;
  let headerLines: string[][] = [];
  if (options.wrapHeaders) {
    const attempt = await layOutWrappedHeaders(layout, visualColumns, widths, pad, headerSize);
    headerFontSize = attempt.size;
    headerLines = attempt.lines;
  } else {
    for (let i = 0; i < visualColumns.length; i++) {
      headerLines.push([
        await ellipsize(
          layout.fonts,
          visualColumns[i].header,
          { size: headerSize, weight: "bold" },
          layout.direction,
          widths[i] - pad * 2,
        ),
      ]);
    }
  }
  const headerLineCount = Math.max(1, ...headerLines.map((lines) => lines.length));
  const headerHeight =
    headerLineCount > 1
      ? Math.max(
          PDF_SPACING.tableHeaderHeight,
          headerLineCount * lineHeightFor(headerFontSize) + pad,
        )
      : PDF_SPACING.tableHeaderHeight;

  const drawHeaderRow = async () => {
    const height = headerHeight;
    const y = layout.y - height;
    layout.currentPage.drawRectangle({
      x: layout.left,
      y,
      width: layout.contentWidth,
      height,
      color: PDF_COLORS.tableHeader,
    });
    for (let i = 0; i < visualColumns.length; i++) {
      const col = visualColumns[i];
      const boxWidth = widths[i] - pad * 2;
      const lines = headerLines[i];
      // Every header block is vertically centred, whatever its own line count.
      const blockHeight = lines.length * lineHeightFor(headerFontSize);
      let lineY =
        headerLineCount === 1
          ? y + height / 2 - headerFontSize / 2 + 1
          : y + height / 2 + blockHeight / 2 - lineHeightFor(headerFontSize) + 1;
      for (const line of lines) {
        await drawText(layout.currentPage, layout.fonts, line, layout.direction, {
          x: offsets[i] + pad,
          y: lineY,
          boxWidth,
          size: headerFontSize,
          weight: "bold",
          color: PDF_COLORS.textInverse,
          align: col.align ?? "start",
        });
        lineY -= lineHeightFor(headerFontSize);
      }
    }
    layout.advance(height);
  };

  await layout.ensureSpace(headerHeight + PDF_SPACING.tableRowHeight * 2);
  await drawHeaderRow();

  if (!rows.length) {
    const height = PDF_SPACING.tableRowHeight;
    const y = layout.y - height;
    layout.currentPage.drawRectangle({
      x: layout.left,
      y,
      width: layout.contentWidth,
      height,
      borderColor: PDF_COLORS.border,
      borderWidth: PDF_SPACING.borderWidth,
    });
    if (options.emptyText) {
      await drawText(layout.currentPage, layout.fonts, options.emptyText, layout.direction, {
        x: layout.left + pad,
        y: y + height / 2 - cellSize / 2 + 1,
        boxWidth: layout.contentWidth - pad * 2,
        size: cellSize,
        color: PDF_COLORS.textMuted,
        align: "center",
      });
    }
    layout.advance(height + PDF_SPACING.paragraphGap);
    return;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];

    // Pre-compute wrapped cell content so the row height is known before drawing.
    const cells: string[][] = [];
    for (let i = 0; i < visualColumns.length; i++) {
      const col = visualColumns[i];
      const raw = col.value(row, r) ?? "";
      const boxWidth = widths[i] - pad * 2;
      if (col.wrap) {
        cells.push(
          await wrapText(layout.fonts, raw, { size: cellSize }, layout.direction, boxWidth),
        );
      } else {
        cells.push([
          await ellipsize(layout.fonts, raw, { size: cellSize }, layout.direction, boxWidth),
        ]);
      }
    }

    const lineCount = Math.max(1, ...cells.map((c) => c.length));
    const rowHeight = Math.max(
      PDF_SPACING.tableRowHeight,
      lineCount * lineHeightFor(cellSize) + pad,
    );

    // A row must not be split across pages; repeat the header when it moves.
    if (await layout.ensureSpace(rowHeight)) {
      await drawHeaderRow();
    }

    const y = layout.y - rowHeight;
    if (options.zebra !== false && r % 2 === 1) {
      layout.currentPage.drawRectangle({
        x: layout.left,
        y,
        width: layout.contentWidth,
        height: rowHeight,
        color: PDF_COLORS.tableRowAlt,
      });
    }
    layout.currentPage.drawLine({
      start: { x: layout.left, y },
      end: { x: layout.left + layout.contentWidth, y },
      thickness: PDF_SPACING.borderWidth,
      color: PDF_COLORS.border,
    });

    for (let i = 0; i < visualColumns.length; i++) {
      const col = visualColumns[i];
      const boxWidth = widths[i] - pad * 2;
      let lineY = y + rowHeight - pad / 2 - cellSize;
      for (const line of cells[i]) {
        if (!line) {
          lineY -= lineHeightFor(cellSize);
          continue;
        }
        await drawText(layout.currentPage, layout.fonts, line, layout.direction, {
          x: offsets[i] + pad,
          y: lineY,
          boxWidth,
          size: cellSize,
          color: col.color?.(row) ?? PDF_COLORS.text,
          align: col.align ?? "start",
        });
        lineY -= lineHeightFor(cellSize);
      }
    }
    layout.advance(rowHeight);
  }

  // Close the table with an outer border on the final page.
  layout.advance(PDF_SPACING.paragraphGap);
}
