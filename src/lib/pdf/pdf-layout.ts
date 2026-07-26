import { PDFDocument, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { PdfFontSet } from "./pdf-fonts";
import type { PdfDirection } from "./pdf-i18n";
import {
  PDF_COLORS,
  PDF_FONT_SIZES,
  PDF_PAGE,
  PDF_SPACING,
  lineHeightFor,
} from "./pdf-theme";
import { drawParagraph, drawText, ellipsize, type TextAlign } from "./pdf-text";

/**
 * Page and block layout for the unified PDF engine.
 *
 * `PdfLayout` owns the cursor, page breaks, header and footer. Documents describe content
 * and never position elements manually, which is what keeps right-to-left and
 * left-to-right documents identical in structure.
 */

export type PdfHeaderInfo = {
  title: string;
  subtitle?: string;
  /** Small key/value pairs shown opposite the title (document number, date...). */
  meta?: Array<{ label: string; value: string }>;
  brandName?: string;
  brandTagline?: string;
  logo?: PDFImage | null;
};

export type PdfFooterInfo = {
  text?: string;
  /** Rendered as "<page> / <total>" using the locale's own wording. */
  pageLabel?: (page: number, total: number) => string;
};

export type PdfLayoutOptions = {
  direction: PdfDirection;
  header: PdfHeaderInfo;
  footer?: PdfFooterInfo;
};

export class PdfLayout {
  readonly pages: PDFPage[] = [];
  /** Left edge of the content column. */
  readonly left = PDF_PAGE.margin;
  readonly contentWidth = PDF_PAGE.width - PDF_PAGE.margin * 2;

  private cursorY = 0;
  private page!: PDFPage;

  private constructor(
    private readonly doc: PDFDocument,
    readonly fonts: PdfFontSet,
    private readonly options: PdfLayoutOptions,
  ) {}

  static async create(
    doc: PDFDocument,
    fonts: PdfFontSet,
    options: PdfLayoutOptions,
  ): Promise<PdfLayout> {
    const layout = new PdfLayout(doc, fonts, options);
    await layout.addPage();
    return layout;
  }

  get direction(): PdfDirection {
    return this.options.direction;
  }

  get currentPage(): PDFPage {
    return this.page;
  }

  get y(): number {
    return this.cursorY;
  }

  /** Lowest baseline usable before the footer area begins. */
  get bottomLimit(): number {
    return PDF_PAGE.margin + PDF_SPACING.footerHeight;
  }

  private async addPage(): Promise<void> {
    this.page = this.doc.addPage([PDF_PAGE.width, PDF_PAGE.height]);
    this.pages.push(this.page);
    this.cursorY = PDF_PAGE.height - PDF_PAGE.margin;
    await this.drawHeader();
  }

  /** Ensures `needed` vertical space exists, starting a new page when it does not. */
  async ensureSpace(needed: number): Promise<boolean> {
    if (this.cursorY - needed >= this.bottomLimit) return false;
    await this.addPage();
    return true;
  }

  advance(amount: number): void {
    this.cursorY -= amount;
  }

  gap(amount = PDF_SPACING.paragraphGap): void {
    this.cursorY -= amount;
  }

  private async drawHeader(): Promise<void> {
    const { header } = this.options;
    const rtl = this.direction === "rtl";
    const bandHeight = PDF_SPACING.headerHeight;
    const bandY = PDF_PAGE.height - bandHeight;

    this.page.drawRectangle({
      x: 0,
      y: bandY,
      width: PDF_PAGE.width,
      height: bandHeight,
      color: PDF_COLORS.brand,
    });

    const logoSize = 34;
    let titleBoxWidth = this.contentWidth;
    let titleX = this.left;

    if (header.logo) {
      const scaled = header.logo.scaleToFit(logoSize, logoSize);
      this.page.drawImage(header.logo, {
        // The logo sits on the side the reader starts from.
        x: rtl ? PDF_PAGE.width - PDF_PAGE.margin - scaled.width : this.left,
        y: bandY + (bandHeight - scaled.height) / 2,
        width: scaled.width,
        height: scaled.height,
      });
      titleBoxWidth -= logoSize + 12;
      if (!rtl) titleX += logoSize + 12;
    }

    const titleY = bandY + bandHeight - 28;
    await drawText(this.page, this.fonts, header.title, this.direction, {
      x: titleX,
      y: titleY,
      boxWidth: titleBoxWidth,
      size: PDF_FONT_SIZES.documentTitle,
      weight: "bold",
      color: PDF_COLORS.textInverse,
      align: "start",
    });

    if (header.subtitle) {
      await drawText(this.page, this.fonts, header.subtitle, this.direction, {
        x: titleX,
        y: titleY - 16,
        boxWidth: titleBoxWidth,
        size: PDF_FONT_SIZES.small,
        color: PDF_COLORS.textInverse,
        align: "start",
      });
    }

    // Meta pairs stack on the far side of the title.
    let metaY = titleY;
    for (const item of header.meta ?? []) {
      await drawText(
        this.page,
        this.fonts,
        `${item.label}: ${item.value}`,
        this.direction,
        {
          x: titleX,
          y: metaY,
          boxWidth: titleBoxWidth,
          size: PDF_FONT_SIZES.small,
          color: PDF_COLORS.textInverse,
          align: "end",
        },
      );
      metaY -= lineHeightFor(PDF_FONT_SIZES.small);
    }

    this.cursorY = bandY - PDF_SPACING.sectionGap;
  }

  /** A titled band used to separate major parts of a document. */
  async sectionTitle(text: string): Promise<void> {
    await this.ensureSpace(PDF_SPACING.tableHeaderHeight + PDF_SPACING.paragraphGap);
    const height = 20;
    const y = this.cursorY - height;
    this.page.drawRectangle({
      x: this.left,
      y,
      width: this.contentWidth,
      height,
      color: PDF_COLORS.panel,
      borderColor: PDF_COLORS.border,
      borderWidth: PDF_SPACING.borderWidth,
    });
    await drawText(this.page, this.fonts, text, this.direction, {
      x: this.left + PDF_SPACING.tableCellPadding,
      y: y + 6,
      boxWidth: this.contentWidth - PDF_SPACING.tableCellPadding * 2,
      size: PDF_FONT_SIZES.sectionTitle,
      weight: "bold",
      color: PDF_COLORS.brandDark,
      align: "start",
    });
    this.cursorY = y - PDF_SPACING.paragraphGap;
  }

  async paragraph(
    text: string,
    opts: { size?: number; color?: RGB; align?: TextAlign; weight?: "regular" | "bold" } = {},
  ): Promise<void> {
    const size = opts.size ?? PDF_FONT_SIZES.body;
    await this.ensureSpace(lineHeightFor(size) * 2);
    const endY = await drawParagraph(this.page, this.fonts, text, this.direction, {
      x: this.left,
      y: this.cursorY - size,
      boxWidth: this.contentWidth,
      size,
      color: opts.color,
      align: opts.align ?? "start",
      weight: opts.weight,
    });
    this.cursorY = endY;
  }

  /**
   * Key/value pairs in a bordered panel, laid out in `columns` columns. The label side
   * follows the document direction automatically.
   */
  async infoPanel(
    rows: Array<{ label: string; value: string }>,
    columns = 2,
  ): Promise<void> {
    const visible = rows.filter((r) => r.value !== "" && r.value != null);
    if (!visible.length) return;

    const size = PDF_FONT_SIZES.body;
    const rowHeight = lineHeightFor(size) + 2;
    const lineCount = Math.ceil(visible.length / columns);
    const panelHeight = lineCount * rowHeight + PDF_SPACING.panelPadding * 2;

    await this.ensureSpace(panelHeight + PDF_SPACING.paragraphGap);
    const top = this.cursorY;
    const panelY = top - panelHeight;

    this.page.drawRectangle({
      x: this.left,
      y: panelY,
      width: this.contentWidth,
      height: panelHeight,
      color: PDF_COLORS.panel,
      borderColor: PDF_COLORS.border,
      borderWidth: PDF_SPACING.borderWidth,
    });

    const colWidth = (this.contentWidth - PDF_SPACING.panelPadding * 2) / columns;
    for (let i = 0; i < visible.length; i++) {
      const row = visible[i];
      const col = i % columns;
      const line = Math.floor(i / columns);
      // Mirror column order so the first field starts on the reading side.
      const visualCol = this.direction === "rtl" ? columns - 1 - col : col;
      const cellX = this.left + PDF_SPACING.panelPadding + visualCol * colWidth;
      const baseline = top - PDF_SPACING.panelPadding - (line + 1) * rowHeight + 5;

      const labelWidth = await drawText(
        this.page,
        this.fonts,
        `${row.label}:`,
        this.direction,
        {
          x: cellX,
          y: baseline,
          boxWidth: colWidth - 6,
          size,
          weight: "bold",
          color: PDF_COLORS.textMuted,
          align: "start",
        },
      );

      const valueBox = colWidth - 6 - labelWidth - 4;
      const shown = await ellipsize(
        this.fonts,
        row.value,
        { size },
        this.direction,
        Math.max(valueBox, 10),
      );
      await drawText(this.page, this.fonts, shown, this.direction, {
        x: this.direction === "rtl" ? cellX : cellX + labelWidth + 4,
        y: baseline,
        boxWidth: Math.max(valueBox, 10),
        size,
        color: PDF_COLORS.text,
        align: this.direction === "rtl" ? "end" : "start",
      });
    }

    this.cursorY = panelY - PDF_SPACING.paragraphGap;
  }

  /** Emphasised totals block, aligned to the reading side. */
  async totals(
    rows: Array<{ label: string; value: string; strong?: boolean; color?: RGB }>,
  ): Promise<void> {
    if (!rows.length) return;
    const size = PDF_FONT_SIZES.heading;
    const rowHeight = lineHeightFor(size) + 3;
    const boxWidth = Math.min(260, this.contentWidth * 0.55);
    await this.ensureSpace(rows.length * rowHeight + PDF_SPACING.paragraphGap);

    const boxX = this.direction === "rtl" ? this.left : this.left + this.contentWidth - boxWidth;

    for (const row of rows) {
      const baseline = this.cursorY - size;
      if (row.strong) {
        this.page.drawRectangle({
          x: boxX,
          y: baseline - 5,
          width: boxWidth,
          height: rowHeight,
          color: PDF_COLORS.panel,
        });
      }
      await drawText(this.page, this.fonts, row.label, this.direction, {
        x: boxX + 6,
        y: baseline,
        boxWidth: boxWidth - 12,
        size,
        weight: row.strong ? "bold" : "regular",
        color: row.color ?? PDF_COLORS.textMuted,
        align: "start",
      });
      await drawText(this.page, this.fonts, row.value, this.direction, {
        x: boxX + 6,
        y: baseline,
        boxWidth: boxWidth - 12,
        size,
        weight: row.strong ? "bold" : "regular",
        color: row.color ?? PDF_COLORS.text,
        align: "end",
      });
      this.cursorY -= rowHeight;
    }
    this.cursorY -= PDF_SPACING.paragraphGap;
  }

  /**
   * Footers are drawn last so every page can show the final page count.
   * Called by the engine, not by documents.
   */
  async finalize(): Promise<void> {
    const { footer } = this.options;
    const total = this.pages.length;
    const size = PDF_FONT_SIZES.footer;

    for (let i = 0; i < total; i++) {
      const page = this.pages[i];
      const y = PDF_PAGE.margin - 6;
      page.drawLine({
        start: { x: this.left, y: y + 16 },
        end: { x: this.left + this.contentWidth, y: y + 16 },
        thickness: PDF_SPACING.borderWidth,
        color: PDF_COLORS.border,
      });

      if (footer?.text) {
        await drawText(page, this.fonts, footer.text, this.direction, {
          x: this.left,
          y,
          boxWidth: this.contentWidth,
          size,
          color: PDF_COLORS.textMuted,
          align: "start",
        });
      }
      const label = footer?.pageLabel
        ? footer.pageLabel(i + 1, total)
        : `${i + 1} / ${total}`;
      await drawText(page, this.fonts, label, this.direction, {
        x: this.left,
        y,
        boxWidth: this.contentWidth,
        size,
        color: PDF_COLORS.textMuted,
        align: "end",
      });
    }
  }
}
