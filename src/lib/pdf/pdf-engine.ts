import { PDFDocument, type PDFImage } from "pdf-lib";
import type { AppLocale } from "@/lib/i18n/constants";
import { PdfFontSet, preloadPdfFonts } from "./pdf-fonts";
import {
  directionForLocale,
  normalizePdfLocale,
  type PdfDirection,
} from "./pdf-i18n";
import { PdfLayout, type PdfHeaderInfo } from "./pdf-layout";
import { pdfTranslator, type PdfStringKey, type PdfTranslator } from "./pdf-strings";
import { PDF_THEME, type PdfTheme } from "./pdf-theme";
import { formatDateTime, safeFileNamePart } from "./pdf-utils";

/**
 * The only entry point for creating a PDF in this system.
 *
 * A document type registers a renderer that receives a ready `PdfContext` — fonts already
 * embedded, direction resolved from the language, header and footer drawn, theme and
 * translations available. Documents therefore cannot diverge in fonts, direction or style.
 */

export type PdfDocumentType =
  | "invoice"
  | "receipt"
  | "quote"
  | "paymentDemand"
  | "transactionAccount"
  | "order"
  | "deliveryNote"
  | "inventoryCount"
  | "inventoryReport"
  | "inventoryDailyReport"
  | "inventoryCountSummary"
  | "salesReport"
  | "profitLoss"
  | "financialReport"
  | "employeeReport"
  | "cashflow"
  | "payment"
  | "generic";

/** Title key used for each document type, so titles are translated, never hardcoded. */
const TITLE_KEYS: Record<PdfDocumentType, PdfStringKey> = {
  invoice: "doc.invoice",
  receipt: "doc.receipt",
  quote: "doc.quote",
  paymentDemand: "doc.paymentDemand",
  transactionAccount: "doc.transactionAccount",
  order: "doc.order",
  deliveryNote: "doc.deliveryNote",
  inventoryCount: "doc.inventoryCount",
  inventoryReport: "doc.inventoryReport",
  inventoryDailyReport: "doc.inventoryDailyReport",
  inventoryCountSummary: "doc.inventoryCountSummary",
  salesReport: "doc.salesReport",
  profitLoss: "doc.profitLoss",
  financialReport: "doc.financialReport",
  employeeReport: "doc.employeeReport",
  cashflow: "doc.cashflow",
  payment: "doc.payment",
  generic: "doc.generic",
};

export function pdfDocumentTitle(type: PdfDocumentType, locale: AppLocale): string {
  return pdfTranslator(locale)(TITLE_KEYS[type]);
}

/** Everything a document renderer needs. */
export type PdfContext = {
  doc: PDFDocument;
  layout: PdfLayout;
  fonts: PdfFontSet;
  direction: PdfDirection;
  locale: AppLocale;
  t: PdfTranslator;
  theme: PdfTheme;
  /** Embeds a PNG/JPEG once for reuse (logos, signatures, QR, barcodes). */
  embedImage: (bytes: Uint8Array | ArrayBuffer) => Promise<PDFImage | null>;
};

export type PdfRenderer<Data> = (ctx: PdfContext, data: Data) => Promise<void>;

export type CreatePdfOptions<Data> = {
  documentType: PdfDocumentType;
  data: Data;
  /** Any locale string; unknown values fall back to Hebrew. */
  language?: string | null;
  render: PdfRenderer<Data>;
  /** Overrides the translated document title. */
  title?: string;
  subtitle?: string;
  headerMeta?: Array<{ label: string; value: string }>;
  logo?: Uint8Array | ArrayBuffer | null;
  /** Extra footer line; the brand line is used when omitted. */
  footerText?: string;
  metadata?: { author?: string; subject?: string; keywords?: string[] };
};

export type CreatedPdf = {
  bytes: Uint8Array;
  pageCount: number;
  locale: AppLocale;
  direction: PdfDirection;
  /** Code points no bundled font could draw. Empty in a healthy document. */
  missingGlyphs: number[];
  durationMs: number;
};

/**
 * Builds a PDF for `documentType` in `language`.
 *
 * Direction, fonts, bidi handling, theme and page furniture are applied here; the renderer
 * only describes content.
 */
export async function createPdf<Data>(
  options: CreatePdfOptions<Data>,
): Promise<CreatedPdf> {
  const startedAt = Date.now();
  const locale = normalizePdfLocale(options.language);
  const direction = directionForLocale(locale);
  const t = pdfTranslator(locale);

  await preloadPdfFonts();

  const doc = await PDFDocument.create();
  const fonts = PdfFontSet.create(doc);

  const imageCache = new Map<string, Promise<PDFImage | null>>();
  const embedImage = async (bytes: Uint8Array | ArrayBuffer) => {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!view.byteLength) return null;
    const key = `${view.byteLength}:${view[0]}:${view[1]}:${view[view.byteLength - 1]}`;
    const cached = imageCache.get(key);
    if (cached) return cached;

    const task = (async () => {
      // PNG and JPEG are the formats pdf-lib supports; anything else is skipped rather
      // than failing a whole invoice.
      const isPng = view[0] === 0x89 && view[1] === 0x50;
      try {
        return isPng ? await doc.embedPng(view) : await doc.embedJpg(view);
      } catch {
        return null;
      }
    })();
    imageCache.set(key, task);
    return task;
  };

  const logo = options.logo ? await embedImage(options.logo) : null;

  const header: PdfHeaderInfo = {
    title: options.title ?? pdfDocumentTitle(options.documentType, locale),
    subtitle: options.subtitle,
    meta: options.headerMeta,
    brandName: t("brandName"),
    brandTagline: t("brandTagline"),
    logo,
  };

  const layout = await PdfLayout.create(doc, fonts, {
    direction,
    header,
    footer: {
      text: options.footerText ?? `${t("brandName")} — ${t("brandTagline")}`,
      pageLabel: (page, total) => `${t("page")} ${page} ${t("of")} ${total}`,
    },
  });

  const ctx: PdfContext = {
    doc,
    layout,
    fonts,
    direction,
    locale,
    t,
    theme: PDF_THEME,
    embedImage,
  };

  await options.render(ctx, options.data);
  await layout.finalize();

  doc.setTitle(header.title);
  doc.setProducer(t("brandName"));
  doc.setCreator(t("brandName"));
  doc.setCreationDate(new Date());
  if (options.metadata?.author) doc.setAuthor(options.metadata.author);
  if (options.metadata?.subject) doc.setSubject(options.metadata.subject);
  if (options.metadata?.keywords?.length) doc.setKeywords(options.metadata.keywords);

  const bytes = await doc.save();

  return {
    bytes,
    pageCount: doc.getPageCount(),
    locale,
    direction,
    missingGlyphs: fonts.missingCodePoints(),
    durationMs: Date.now() - startedAt,
  };
}

/** Consistent, locale-aware download names: `invoice-INV-00015-26-07-2026.pdf`. */
export function pdfFileName(
  documentType: PdfDocumentType,
  reference: string | null | undefined,
  locale: AppLocale = "he",
): string {
  const base = safeFileNamePart(pdfDocumentTitle(documentType, locale), documentType);
  const ref = reference ? `-${safeFileNamePart(reference, "")}` : "";
  const stamp = formatDateTime(new Date())
    .replace(/[\u200E]/g, "")
    .replace(/[/:]/g, "-")
    .replace(/\s+/g, "_");
  return `${base}${ref}-${stamp}.pdf`.replace(/-+/g, "-");
}
