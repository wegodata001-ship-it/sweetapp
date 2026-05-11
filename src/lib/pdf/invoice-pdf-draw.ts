import type { PDFFont, PDFPage } from "pdf-lib";
import { rgb } from "pdf-lib";

/** A4 landscape — רוחב תוכן ~760pt */
export const PDF_PAGE_W = 841.89;
export const PDF_PAGE_H = 595.28;
export const PDF_MARGIN = 40;
export const CONTENT_W = PDF_PAGE_W - PDF_MARGIN * 2;

export const C = {
  text: rgb(15 / 255, 23 / 255, 42 / 255),
  muted: rgb(71 / 255, 85 / 255, 105 / 255),
  white: rgb(1, 1, 1),
  cardBg: rgb(248 / 255, 250 / 255, 252 / 255),
  cardBorder: rgb(226 / 255, 232 / 255, 240 / 255),
  gold: rgb(212 / 255, 175 / 255, 55 / 255),
  tableHeader: rgb(15 / 255, 23 / 255, 42 / 255),
  zebraA: rgb(1, 1, 1),
  zebraB: rgb(248 / 255, 250 / 255, 252 / 255),
  summaryNetBg: rgb(241 / 255, 245 / 255, 249 / 255),
  summaryVatBg: rgb(234 / 255, 88 / 255, 12 / 255),
  summaryTotalBg: rgb(16 / 255, 185 / 255, 129 / 255),
  danger: rgb(220 / 255, 38 / 255, 38 / 255),
  dangerBg: rgb(254 / 255, 242 / 255, 242 / 255),
  footerLine: rgb(226 / 255, 232 / 255, 240 / 255),
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

export function drawHeader(
  page: PDFPage,
  fonts: { he: PDFFont; heBold: PDFFont; enBold: PDFFont },
  params: { reportTitleHe: string; metaLines: string[] },
): number {
  const top = PDF_PAGE_H - PDF_MARGIN;
  const bandH = 108;
  const yBandBottom = top - bandH;

  page.drawRectangle({
    x: PDF_MARGIN,
    y: yBandBottom,
    width: CONTENT_W,
    height: bandH,
    color: C.white,
    borderColor: C.gold,
    borderWidth: 2,
  });

  const metaW = 210;
  const metaPad = 14;
  const metaX = PDF_MARGIN + 14;
  const metaInnerH = bandH - 28;
  const metaY = yBandBottom + 14;
  drawCard(page, metaX, metaY, metaW, metaInnerH, C.cardBg, C.cardBorder);

  let my = metaY + metaInnerH - metaPad - 11;
  const metaRight = metaX + metaW - metaPad;
  for (const line of params.metaLines) {
    drawRtlText(page, fonts.he, line, metaRight, my, 10, C.text);
    my -= 16;
  }

  const brand = "WEGO BUSINESS";
  const bw = fonts.enBold.widthOfTextAtSize(brand, 9);
  drawLtrText(page, fonts.enBold, brand, PDF_MARGIN + CONTENT_W - 14 - bw, yBandBottom + bandH - 26, 9, C.muted);
  const titleRight = PDF_MARGIN + CONTENT_W - 14;
  drawRtlText(page, fonts.heBold, params.reportTitleHe, titleRight, yBandBottom + bandH - 48, 22, C.text);
  drawRtlText(page, fonts.he, "מסמך פיננסי · WEGO ERP", titleRight, yBandBottom + bandH - 74, 11, C.muted);

  return yBandBottom - 14;
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

export function drawSummaryBoxes(
  page: PDFPage,
  fonts: { he: PDFFont; bold: PDFFont },
  items: { label: string; amount: string; bg: typeof C.text; fg: typeof C.text }[],
  x: number,
  yTop: number,
  width: number,
): number {
  const gap = 12;
  const n = items.length;
  const boxW = (width - gap * (n - 1)) / n;
  const boxH = 76;
  const yBottom = yTop - boxH;

  items.forEach((it, i) => {
    const bx = x + i * (boxW + gap);
    page.drawRectangle({
      x: bx,
      y: yBottom,
      width: boxW,
      height: boxH,
      color: it.bg,
      borderColor: C.cardBorder,
      borderWidth: 1,
    });
    drawRtlText(page, fonts.he, it.label, bx + boxW - 16, yBottom + boxH - 24, 10, it.fg);
    const amt = it.amount;
    // סכומים תמיד ב־`he` (VF עם ספרות + ₪). `bold` הוא Noto עברי צר וללא ספרות ASCII → □
    const tw = fonts.he.widthOfTextAtSize(amt, 17);
    page.drawText(amt, {
      x: bx + boxW - 16 - tw,
      y: yBottom + 20,
      size: 17,
      font: fonts.he,
      color: it.fg,
    });
  });
  return yBottom - 18;
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

export function drawFooter(page: PDFPage, fonts: { en: PDFFont }) {
  const lineY = PDF_MARGIN + 44;
  page.drawLine({
    start: { x: PDF_MARGIN, y: lineY },
    end: { x: PDF_PAGE_W - PDF_MARGIN, y: lineY },
    thickness: 1,
    color: C.footerLine,
  });
  drawLtrText(page, fonts.en, "Generated by WEGO ERP", PDF_MARGIN, PDF_MARGIN + 22, 9, C.muted);
  const site = process.env.WEGO_SITE_URL?.trim() || "www.wegobusiness.com";
  const sw = fonts.en.widthOfTextAtSize(site, 9);
  drawLtrText(page, fonts.en, site, PDF_PAGE_W - PDF_MARGIN - sw, PDF_MARGIN + 22, 9, C.muted);
}
