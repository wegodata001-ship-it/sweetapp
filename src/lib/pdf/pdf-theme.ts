import { rgb, type RGB } from "pdf-lib";

/**
 * The single visual language for every PDF in the system. Documents must not define their
 * own colours, sizes or spacing — they read them from here so an invoice, a receipt and an
 * inventory report look like the same product.
 */

export const PDF_PAGE = {
  /** A4 in points. */
  width: 595.28,
  height: 841.89,
  margin: 44,
} as const;

export const PDF_CONTENT_WIDTH = PDF_PAGE.width - PDF_PAGE.margin * 2;

export const PDF_COLORS = {
  text: rgb(0.11, 0.13, 0.17),
  textMuted: rgb(0.42, 0.46, 0.53),
  textInverse: rgb(1, 1, 1),
  brand: rgb(0.05, 0.35, 0.55),
  brandDark: rgb(0.03, 0.24, 0.39),
  accent: rgb(0.85, 0.62, 0.13),
  border: rgb(0.82, 0.85, 0.89),
  panel: rgb(0.96, 0.97, 0.98),
  tableHeader: rgb(0.05, 0.35, 0.55),
  tableRowAlt: rgb(0.965, 0.975, 0.985),
  positive: rgb(0.09, 0.46, 0.25),
  negative: rgb(0.68, 0.13, 0.13),
} as const satisfies Record<string, RGB>;

export const PDF_FONT_SIZES = {
  documentTitle: 20,
  sectionTitle: 12,
  heading: 11,
  body: 9.5,
  tableHeader: 9.5,
  tableCell: 9,
  small: 8,
  footer: 7.5,
} as const;

export const PDF_SPACING = {
  /** Baseline-to-baseline distance as a multiple of font size. */
  lineHeight: 1.42,
  paragraphGap: 8,
  sectionGap: 16,
  panelPadding: 10,
  tableRowHeight: 20,
  tableHeaderHeight: 22,
  tableCellPadding: 7,
  borderWidth: 0.7,
  headerHeight: 74,
  footerHeight: 42,
} as const;

export type PdfTheme = {
  page: typeof PDF_PAGE;
  colors: typeof PDF_COLORS;
  fontSizes: typeof PDF_FONT_SIZES;
  spacing: typeof PDF_SPACING;
  contentWidth: number;
};

export const PDF_THEME: PdfTheme = {
  page: PDF_PAGE,
  colors: PDF_COLORS,
  fontSizes: PDF_FONT_SIZES,
  spacing: PDF_SPACING,
  contentWidth: PDF_CONTENT_WIDTH,
};

export function lineHeightFor(size: number): number {
  return size * PDF_SPACING.lineHeight;
}
