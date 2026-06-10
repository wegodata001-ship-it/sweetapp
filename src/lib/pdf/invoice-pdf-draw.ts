import type { PDFFont, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";

/** A4 landscape — רוחב תוכן ~760pt */
export const PDF_PAGE_W = 841.89;
export const PDF_PAGE_H = 595.28;
export const PDF_MARGIN = 40;
export const CONTENT_W = PDF_PAGE_W - PDF_MARGIN * 2;

export const C = {
  navy: rgb(3 / 255, 20 / 255, 47 / 255),
  gold: rgb(212 / 255, 175 / 255, 55 / 255),
  grayBg: rgb(243 / 255, 244 / 255, 246 / 255),
  text: rgb(3 / 255, 20 / 255, 47 / 255),
  muted: rgb(71 / 255, 85 / 255, 105 / 255),
  white: rgb(1, 1, 1),
  cardBg: rgb(243 / 255, 244 / 255, 246 / 255),
  cardBorder: rgb(226 / 255, 232 / 255, 240 / 255),
  tableHeader: rgb(3 / 255, 20 / 255, 47 / 255),
  zebraA: rgb(1, 1, 1),
  zebraB: rgb(248 / 255, 250 / 255, 252 / 255),
  danger: rgb(3 / 255, 20 / 255, 47 / 255),
  dangerBg: rgb(243 / 255, 244 / 255, 246 / 255),
  footerLine: rgb(212 / 255, 175 / 255, 55 / 255),
};

export function drawRtlText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  rightX: number,
  yBaseline: number,
  size: number,
  color = C.text,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y: yBaseline, size, font, color });
}

export function drawLtrText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  leftX: number,
  yBaseline: number,
  size: number,
  color = C.text,
) {
  page.drawText(text, { x: leftX, y: yBaseline, size, font, color });
}

export function drawAmountInCell(
  page: PDFPage,
  font: PDFFont,
  text: string,
  cellRight: number,
  yBaseline: number,
  size: number,
  color = C.text,
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cellRight - w, y: yBaseline, size, font, color });
}

export function drawCard(
  page: PDFPage,
  x: number,
  yBottom: number,
  w: number,
  h: number,
  fill = C.cardBg,
  stroke = C.cardBorder,
) {
  page.drawRectangle({
    x,
    y: yBottom,
    width: w,
    height: h,
    color: fill,
    borderColor: stroke,
    borderWidth: 1,
  });
}

export type HeaderMetaField = { label: string; value: string };

function parseMetaFields(params: {
  metaFields?: HeaderMetaField[];
  metaLines?: string[];
}): HeaderMetaField[] {
  if (params.metaFields?.length) return params.metaFields;
  return (params.metaLines ?? []).map((line) => {
    const idx = line.indexOf(":");
    if (idx > 0) {
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    }
    return { label: "", value: line };
  });
}

export function drawHeader(
  page: PDFPage,
  fonts: { he: PDFFont; heBold: PDFFont; enBold: PDFFont },
  params: { reportTitleHe: string; metaFields?: HeaderMetaField[]; metaLines?: string[] },
): number {
  const top = PDF_PAGE_H - PDF_MARGIN;
  const bandH = 92;
  const yBandBottom = top - bandH;
  const fields = parseMetaFields(params);

  page.drawRectangle({
    x: PDF_MARGIN,
    y: yBandBottom,
    width: CONTENT_W,
    height: bandH,
    color: C.grayBg,
  });
  page.drawRectangle({
    x: PDF_MARGIN,
    y: yBandBottom,
    width: CONTENT_W,
    height: 2,
    color: C.gold,
  });

  const titleRight = PDF_MARGIN + CONTENT_W - 18;
  const brand = "WEGO ERP";
  const brandW = fonts.enBold.widthOfTextAtSize(brand, 12);
  drawLtrText(page, fonts.enBold, brand, titleRight - brandW, yBandBottom + bandH - 24, 12, C.navy);
  drawRtlText(page, fonts.heBold, params.reportTitleHe, titleRight, yBandBottom + bandH - 46, 18, C.navy);

  const metaW = 250;
  const metaX = PDF_MARGIN + 18;
  const labelRight = metaX + metaW - 12;
  const valueRight = labelRight - 88;
  let my = yBandBottom + bandH - 24;
  for (const field of fields) {
    if (field.label) {
      drawRtlText(page, fonts.heBold, field.label, labelRight, my, 9, C.muted);
    }
    drawRtlText(page, fonts.he, field.value, valueRight, my, 9, C.text);
    my -= 15;
  }

  return yBandBottom - 16;
}

/** כרטיס סעיף: כותרת + שורות תווית | ערך (RTL) */
export function drawLabeledSection(
  page: PDFPage,
  fonts: { he: PDFFont; bold: PDFFont },
  title: string,
  rows: { label: string; value: string }[],
  x: number,
  yTop: number,
  w: number,
): number {
  const pad = 18;
  const titleGap = 28;
  const rowH = 22;
  const h = pad + titleGap + rows.length * rowH + pad;
  const yBottom = yTop - h;
  drawCard(page, x, yBottom, w, h);
  drawRtlText(page, fonts.bold, title, x + w - pad, yTop - pad, 12, C.text);
  const labelRight = x + w - pad;
  const valueFieldRight = labelRight - 160;
  let cy = yTop - pad - titleGap;
  for (const row of rows) {
    drawRtlText(page, fonts.bold, row.label, labelRight, cy, 10, C.muted);
    drawRtlText(page, fonts.he, row.value, valueFieldRight, cy, 10, C.text);
    cy -= rowH;
  }
  return yBottom - 18;
}

export type ItemColumn = { key: string; width: number; header: string; numeric?: boolean };

export function drawDataTable(
  page: PDFPage,
  fonts: { he: PDFFont; num?: PDFFont },
  columns: ItemColumn[],
  dataRows: Record<string, string>[],
  x: number,
  yTop: number,
  width: number,
): number {
  const headerH = 30;
  const rowH = 28;
  const totalH = headerH + dataRows.length * rowH;
  const yBottom = yTop - totalH;

  page.drawRectangle({
    x,
    y: yBottom,
    width,
    height: totalH,
    color: C.zebraA,
    borderColor: C.cardBorder,
    borderWidth: 1,
  });

  page.drawRectangle({
    x,
    y: yTop - headerH,
    width,
    height: headerH,
    color: C.tableHeader,
  });

  let colRight = x + width - 12;
  for (const col of columns) {
    drawRtlText(page, fonts.he, col.header, colRight, yTop - headerH + 10, 9, C.white);
    colRight -= col.width;
  }

  let rowY = yTop - headerH;
  dataRows.forEach((row, idx) => {
    rowY -= rowH;
    const bg = idx % 2 === 0 ? C.zebraA : C.zebraB;
    page.drawRectangle({ x, y: rowY, width, height: rowH, color: bg });
    let cRight = x + width - 12;
    for (const col of columns) {
      const val = row[col.key] ?? "";
      // תמיד גופן עברית לתאים — מכיל ₪ ומספרים; WinAnsis לא תומך ב־₪/תווי bidi
      drawAmountInCell(page, fonts.he, val, cRight, rowY + 9, 9, C.text);
      cRight -= col.width;
    }
  });

  return yBottom - 12;
}

export function drawSummaryLines(
  page: PDFPage,
  fonts: { he: PDFFont; bold: PDFFont },
  items: { label: string; amount: string; emphasize?: boolean }[],
  x: number,
  yTop: number,
  width: number,
): number {
  const rowH = 22;
  const padTop = 10;
  const padBottom = 8;
  const blockH = padTop + 1 + items.length * rowH + 1 + padBottom;
  const yBottom = yTop - blockH;
  const rightEdge = x + width - 18;
  const lineLeft = x + width * 0.52;
  const amountRight = x + width * 0.38;

  const drawRule = (ruleY: number) => {
    page.drawLine({
      start: { x: lineLeft, y: ruleY },
      end: { x: rightEdge, y: ruleY },
      thickness: 0.75,
      color: C.gold,
    });
  };

  drawRule(yTop - padTop);
  let cy = yTop - padTop - 16;
  for (const item of items) {
    const fg = item.emphasize ? C.navy : C.text;
    const size = item.emphasize ? 11 : 10;
    drawRtlText(page, item.emphasize ? fonts.bold : fonts.he, item.label, rightEdge, cy, size, fg);
    drawAmountInCell(page, fonts.he, item.amount, amountRight, cy, size, fg);
    cy -= rowH;
  }
  drawRule(cy + 10);

  return yBottom - 14;
}

export function drawTwoColPaymentTable(
  page: PDFPage,
  fonts: { he: PDFFont; bold: PDFFont },
  rows: { method: string; amount: string }[],
  x: number,
  yTop: number,
  width: number,
): number {
  const headerH = 28;
  const rowH = 26;
  const totalH = headerH + rows.length * rowH;
  const yBottom = yTop - totalH;

  page.drawRectangle({
    x,
    y: yBottom,
    width,
    height: totalH,
    color: C.cardBg,
    borderColor: C.cardBorder,
    borderWidth: 1,
  });
  page.drawRectangle({ x, y: yTop - headerH, width, height: headerH, color: C.tableHeader });
  drawRtlText(page, fonts.bold, "סכום", x + width * 0.28, yTop - headerH + 10, 9, C.white);
  drawRtlText(page, fonts.bold, "אמצעי תשלום", x + width - 14, yTop - headerH + 10, 9, C.white);

  let ry = yTop - headerH;
  rows.forEach((r, idx) => {
    ry -= rowH;
    page.drawRectangle({ x, y: ry, width, height: rowH, color: idx % 2 === 0 ? C.zebraA : C.zebraB });
    drawRtlText(page, fonts.he, r.method, x + width - 14, ry + 9, 10, C.text);
    drawAmountInCell(page, fonts.he, r.amount, x + width * 0.28, ry + 9, 10, C.text);
  });
  return yBottom - 10;
}

export function drawOpenBalanceBox(
  page: PDFPage,
  fonts: { he: PDFFont; bold: PDFFont },
  amountFormatted: string,
  x: number,
  yTop: number,
  width: number,
): number {
  const h = 46;
  const yb = yTop - h;
  page.drawRectangle({
    x,
    y: yb,
    width,
    height: h,
    color: C.dangerBg,
    borderColor: C.danger,
    borderWidth: 1,
  });
  drawRtlText(page, fonts.bold, "יתרה פתוחה", x + width - 16, yb + h - 18, 12, C.danger);
  drawAmountInCell(page, fonts.he, amountFormatted, x + width * 0.4, yb + h - 18, 14, C.danger);
  return yb - 14;
}

export function drawFooter(page: PDFPage, fonts: { en: PDFFont; enBold?: PDFFont }) {
  const lineY = PDF_MARGIN + 36;
  page.drawLine({
    start: { x: PDF_MARGIN, y: lineY },
    end: { x: PDF_PAGE_W - PDF_MARGIN, y: lineY },
    thickness: 0.75,
    color: C.footerLine,
  });
  const brandFont = fonts.enBold ?? fonts.en;
  const brand = "WEGO ERP";
  const brandW = brandFont.widthOfTextAtSize(brand, 8);
  const centerX = PDF_PAGE_W / 2;
  drawLtrText(page, brandFont, brand, centerX - brandW / 2, PDF_MARGIN + 18, 8, C.navy);
  const tagline = "Financial Management System";
  const tagW = fonts.en.widthOfTextAtSize(tagline, 7);
  drawLtrText(page, fonts.en, tagline, centerX - tagW / 2, PDF_MARGIN + 6, 7, C.muted);
}
