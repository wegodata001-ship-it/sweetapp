import type { ScannedDocument, ScannedItem } from "./types";
import { parseNumber, tokenizeNumbers } from "./parser";

const MAX_UNIT_PRICE = 10_000;
const MAX_QUANTITY = 500;
const MAX_LINE_TOTAL = 100_000;

function letterCount(s: string): number {
  return (s.match(/[a-zA-Z\u0590-\u05FF\u0600-\u06FF]/gi) ?? []).length;
}

function isLongId(n: number): boolean {
  const digits = String(Math.floor(Math.abs(n))).replace(/\D/g, "");
  return digits.length >= 7 || n > MAX_UNIT_PRICE;
}

/** Loose Hebrew invoice field extraction (OCR.space eng / broken layout). */
export function extractHebrewInvoiceFields(
  text: string,
  lines: string[],
): Pick<
  ScannedDocument,
  "supplierRawName" | "invoiceNumber" | "date" | "total" | "vatAmount" | "documentType"
> {
  let supplierRawName = "";
  let invoiceNumber = "";
  let date = "";
  let total: number | null = null;
  let vatAmount: number | null = null;
  let documentType: string | undefined;

  if (/חשבונית\s*מס\s*זיכוי|זיכוי/i.test(text)) {
    documentType = "חשבונית מס זיכוי";
  } else if (/חשבונית\s*מס|tax\s*invoice/i.test(text)) {
    documentType = "חשבונית מס";
  }

  const invPatterns = [
    /חשבונית\s*מס[^\d]{0,20}(\d{2,12})/i,
    /מס['\s]*חשבונית[^\d]{0,15}(\d{2,12})/i,
    /מספר\s*חשבונית[^\d]{0,15}(\d{2,12})/i,
    /invoice\s*#?\s*(\d{2,12})/i,
    /מס['\s]*#\s*(\d{2,12})/i,
  ];
  for (const re of invPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      invoiceNumber = m[1];
      break;
    }
  }

  const datePatterns = [
    /תאריך[^\d]{0,12}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
    /date[^\d]{0,8}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
    /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/,
  ];
  for (const re of datePatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const iso = toIsoDate(m[1]);
      if (iso) {
        date = iso;
        break;
      }
    }
  }

  const totalPatterns = [
    /סה["']?כ\s*לתשלום[^\d]{0,30}([\d,.]+)/i,
    /סהכ\s*לתשלום[^\d]{0,30}([\d,.]+)/i,
    /total\s*(?:due|pay)?[^\d]{0,20}([\d,.]+)/i,
    /כולל\s*מע["']?מ[^\d]{0,30}([\d,.]+)/i,
  ];
  for (const re of totalPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseNumber(m[1]);
      if (n > 0 && n <= MAX_LINE_TOTAL) {
        total = n;
        break;
      }
    }
  }

  const vatM = text.match(/מע["']?מ[^\d]{0,20}([\d,.]+)/i);
  if (vatM?.[1]) {
    const n = parseNumber(vatM[1]);
    if (n > 0 && n < 50_000) vatAmount = n;
  }

  for (const line of lines.slice(0, 18)) {
    if (letterCount(line) < 4) continue;
    if (/בע["']?מ|בע״מ|ltd|limited/i.test(line)) {
      supplierRawName = line
        .replace(/ח\.?\s*פ.*$/i, "")
        .replace(/עוסק.*$/i, "")
        .trim()
        .slice(0, 80);
      break;
    }
  }

  if (!supplierRawName) {
    for (const line of lines.slice(0, 8)) {
      if (letterCount(line) >= 6 && !/^\d+$/.test(line.replace(/\s/g, ""))) {
        if (!/חשבונית|תאריך|סה["']?כ|מע["']?מ|טלפון|phone/i.test(line)) {
          supplierRawName = line.slice(0, 80);
          break;
        }
      }
    }
  }

  return {
    supplierRawName,
    invoiceNumber,
    date,
    total,
    vatAmount,
    documentType,
  };
}

function toIsoDate(raw: string): string {
  const m1 = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  const m2 = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m2) {
    let y = m2[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  }
  return "";
}

/** Vertical blocks: price / qty / description on separate lines (common OCR.space layout). */
export function parseFallbackLineItems(lines: string[]): ScannedItem[] {
  const items: ScannedItem[] = [];

  const tryAdd = (name: string, qty: number, unitPrice: number) => {
    const n = name.trim();
    if (letterCount(n) < 2) return;
    if (/סה["']?כ|מע["']?מ|חשבונית|תאריך|טלפון/i.test(n)) return;
    if (qty <= 0 || qty > MAX_QUANTITY) return;
    if (unitPrice <= 0 || unitPrice > MAX_UNIT_PRICE) return;
    const lineTotal = qty * unitPrice;
    items.push({
      rawName: n,
      name: n,
      quantity: qty,
      unitPrice,
      lineTotal,
      confidenceScore: 0.55,
      lineStatus: "review",
      uncertain: true,
    });
  };

  for (let i = 0; i < lines.length - 2; i++) {
    const [a, b, c] = [lines[i], lines[i + 1], lines[i + 2]];
    const na = tokenizeNumbers(a).filter((n) => !isLongId(n));
    const nb = tokenizeNumbers(b).filter((n) => !isLongId(n));
    const nc = tokenizeNumbers(c).filter((n) => !isLongId(n));

    // price, qty, name
    if (na.length === 1 && nb.length === 1 && letterCount(c) >= 2 && nc.length === 0) {
      tryAdd(c, nb[0], na[0]);
      i += 2;
      continue;
    }
    // name, qty, price
    if (letterCount(a) >= 2 && nb.length === 1 && nc.length === 1 && na.length === 0) {
      tryAdd(a, nb[0], nc[0]);
      i += 2;
      continue;
    }
    // single line: name + numbers (RTL)
    if (letterCount(a) >= 2 && na.length >= 2) {
      const price = na[na.length - 1];
      const qty = na[na.length - 2];
      if (qty <= MAX_QUANTITY && price <= MAX_UNIT_PRICE) {
        const name = a.replace(/[\d.,\s]+$/g, "").trim() || a;
        tryAdd(name, qty, price);
      }
    }
  }

  const seen = new Set<string>();
  return items.filter((it) => {
    const k = `${it.rawName}|${it.unitPrice}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
