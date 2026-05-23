import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts } from "pdf-lib";

const NOTO_SANS_HEBREW_VF_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/NotoSansHebrew%5Bwdth%2Cwght%5D.ttf";

const NOTO_SANS_HEBREW_BOLD_URL =
  "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Bold.ttf";

let regBytesPromise: Promise<Uint8Array> | null = null;
let boldBytesPromise: Promise<Uint8Array | null> | null = null;

async function loadRegBytes(): Promise<Uint8Array> {
  if (!regBytesPromise) {
    regBytesPromise = (async () => {
      const res = await fetch(NOTO_SANS_HEBREW_VF_URL);
      if (!res.ok) throw new Error("טעינת Noto Sans Hebrew ל-PDF נכשלה");
      return new Uint8Array(await res.arrayBuffer());
    })();
  }
  return regBytesPromise;
}

async function loadBoldBytes(): Promise<Uint8Array | null> {
  if (!boldBytesPromise) {
    boldBytesPromise = (async () => {
      const res = await fetch(NOTO_SANS_HEBREW_BOLD_URL);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    })();
  }
  return boldBytesPromise;
}

export type InvoicePdfFonts = {
  he: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  heBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  en: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  enBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  num: Awaited<ReturnType<PDFDocument["embedFont"]>>;
};

/** גופנים נטענים פעם אחת לתהליך — מקצר יצירת PDF חוזרת */
export async function embedInvoicePdfFonts(pdfDoc: PDFDocument): Promise<InvoicePdfFonts> {
  pdfDoc.registerFontkit(fontkit);
  const [regBytes, boldBytes] = await Promise.all([loadRegBytes(), loadBoldBytes()]);
  const he = await pdfDoc.embedFont(regBytes);
  const heBold = boldBytes ? await pdfDoc.embedFont(boldBytes) : he;
  const [en, enBold] = await Promise.all([
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedFont(StandardFonts.HelveticaBold),
  ]);
  return { he, heBold, en, enBold, num: en };
}
