import * as XLSX from "xlsx";

/** שורה גולמית מתוך הקובץ החיצוני — לפני התאמה (תומך עברית/אנגלית/טורקית) */
export type ParsedExternalRow = {
  externalOrderId: string | null;
  externalCustomerCode: string | null;
  externalCustomerName: string | null;
  externalAmount: number | null;
  externalDate: Date | null;
  /** AÇIKLAMA → שבוע עבודה (per-row) */
  externalWeek: string | null;
  /** TAHSİLAT ŞEKLİ → אמצעי תשלום */
  paymentMethod: string | null;
};

type FieldKey = "orderId" | "customerCode" | "customerName" | "amount" | "date" | "week" | "payment";

/**
 * מילות מפתח לזיהוי עמודות (עברית/אנגלית/טורקית).
 * הסדר חשוב — הספציפי קודם (למשל "musteri id" לפני "id").
 */
const FIELD_KEYWORDS: Record<FieldKey, string[]> = {
  customerCode: [
    "musteri id",
    "musteri no",
    "cari kod",
    "cari id",
    "customer code",
    "client code",
    "קוד לקוח",
    "מספר לקוח",
    "מס לקוח",
    "code",
    "קוד",
  ],
  orderId: [
    "order id",
    "order no",
    "order number",
    "fis no",
    "belge no",
    "sira no",
    "sira",
    "מספר הזמנה",
    "מס הזמנה",
    "הזמנה",
    "invoice",
    "order",
    "doc",
    "id",
  ],
  amount: [
    "toplam",
    "tutar",
    "genel toplam",
    "amount",
    "total amount",
    "total",
    "sum",
    "price",
    "סכום",
    'סה"כ',
    "סהכ",
    "מחיר",
  ],
  date: ["tahsilat tarihi", "odeme tarihi", "tarih", "order date", "date", "תאריך הזמנה", "תאריך"],
  payment: ["tahsilat sekli", "odeme sekli", "odeme", "payment method", "payment", "אמצעי תשלום", "תשלום"],
  week: ["aciklama", "description", "week code", "week", "hafta", "שבוע עבודה", "שבוע", "הערה", "תיאור"],
  customerName: [
    "musteri adi",
    "cari adi",
    "cari unvan",
    "customer name",
    "client name",
    "שם לקוח",
    "שם הלקוח",
    "customer",
    "name",
    "adi",
    "unvan",
    "שם",
    "לקוח",
  ],
};

/** נרמול כותרת — כולל תווים טורקיים (İ ş ı ç ü ö ğ) */
function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-."'״׳]+/g, " ")
    .trim();
}

function detectColumns(headerRow: unknown[]): Record<FieldKey, number> {
  const normalized = headerRow.map(normalizeHeader);
  const used = new Set<number>();
  const result: Record<FieldKey, number> = {
    orderId: -1,
    customerCode: -1,
    customerName: -1,
    amount: -1,
    date: -1,
    week: -1,
    payment: -1,
  };
  // קודם הספציפיים, שם הלקוח אחרון (הכי גנרי)
  const order: FieldKey[] = [
    "customerCode",
    "amount",
    "date",
    "payment",
    "week",
    "orderId",
    "customerName",
  ];
  for (const field of order) {
    let best = -1;
    for (const kw of FIELD_KEYWORDS[field]) {
      // התאמה מדויקת קודם, ואז הכלה
      let idx = normalized.findIndex((h, i) => !used.has(i) && h === kw);
      if (idx < 0) idx = normalized.findIndex((h, i) => !used.has(i) && h.includes(kw));
      if (idx >= 0) {
        best = idx;
        break;
      }
    }
    if (best >= 0) {
      result[field] = best;
      used.add(best);
    }
  }
  return result;
}

function looksLikeHeader(row: unknown[]): boolean {
  const text = row.map(normalizeHeader).join(" ");
  const hints = [
    "order",
    "amount",
    "customer",
    "code",
    "musteri",
    "toplam",
    "tahsilat",
    "aciklama",
    "tarih",
    "סכום",
    "לקוח",
    "הזמנה",
    "קוד",
    "תאריך",
    "date",
  ];
  return hints.some((h) => text.includes(h));
}

/** המרת מספר עם תמיכה בפורמט טורקי/אירופי (1.234,56) ובפורמט אנגלי (1,234.56) */
function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // נקודה=אלפים, פסיק=עשרוני
    } else {
      s = s.replace(/,/g, ""); // פסיק=אלפים
    }
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = XLSX.SSF ? XLSX.SSF.parse_date_code(value) : null;
    if (d) return new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1, d.H || 0, d.M || 0, Math.floor(d.S || 0)));
  }
  const str = String(value).trim();
  // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy
  const m = str.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function cellToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * קורא קובץ xlsx / xls / csv ל-buffer ומחזיר שורות גולמיות. קריאה בלבד — אין שינוי בהזמנות.
 */
export function parseExternalSpreadsheet(buffer: Buffer): ParsedExternalRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  if (matrix.length === 0) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, matrix.length); i++) {
    if (looksLikeHeader(matrix[i])) {
      headerIdx = i;
      break;
    }
  }
  const cols = detectColumns(matrix[headerIdx]);

  const rows: ParsedExternalRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const raw = matrix[r];
    if (!raw || raw.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const externalOrderId = cols.orderId >= 0 ? cellToString(raw[cols.orderId]) : null;
    const externalCustomerCode = cols.customerCode >= 0 ? cellToString(raw[cols.customerCode]) : null;
    const externalCustomerName = cols.customerName >= 0 ? cellToString(raw[cols.customerName]) : null;
    const externalAmount = cols.amount >= 0 ? parseAmount(raw[cols.amount]) : null;
    const externalDate = cols.date >= 0 ? parseDate(raw[cols.date]) : null;
    const externalWeek = cols.week >= 0 ? cellToString(raw[cols.week]) : null;
    const paymentMethod = cols.payment >= 0 ? cellToString(raw[cols.payment]) : null;
    if (
      !externalOrderId &&
      !externalCustomerCode &&
      !externalCustomerName &&
      externalAmount === null &&
      !externalDate
    ) {
      continue;
    }
    rows.push({
      externalOrderId,
      externalCustomerCode,
      externalCustomerName,
      externalAmount,
      externalDate,
      externalWeek,
      paymentMethod,
    });
  }
  return rows;
}
