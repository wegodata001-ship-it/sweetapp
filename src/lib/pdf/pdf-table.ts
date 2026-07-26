import type { RGB } from "pdf-lib";
import type { PdfLayout } from "./pdf-layout";
import {
  PDF_COLORS,
  PDF_FONT_SIZES,
  PDF_SPACING,
  lineHeightFor,
} from "./pdf-theme";
import { drawText, ellipsize, wrapText, type TextAlign } from "./pdf-text";

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
};

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

  const drawHeaderRow = async () => {
    const height = PDF_SPACING.tableHeaderHeight;
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
      const shown = await ellipsize(
        layout.fonts,
        col.header,
        { size: headerSize, weight: "bold" },
        layout.direction,
        boxWidth,
      );
      await drawText(layout.currentPage, layout.fonts, shown, layout.direction, {
        x: offsets[i] + pad,
        y: y + height / 2 - headerSize / 2 + 1,
        boxWidth,
        size: headerSize,
        weight: "bold",
        color: PDF_COLORS.textInverse,
        align: col.align ?? "start",
      });
    }
    layout.advance(height);
  };

  await layout.ensureSpace(PDF_SPACING.tableHeaderHeight + PDF_SPACING.tableRowHeight * 2);
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
