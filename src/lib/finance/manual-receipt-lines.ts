import { addMoney, computeManualReceiptVat, type ManualVatMode } from "@/lib/finance/manual-receipt-vat";

const MARKER = "wego-manual-v1";

export type ManualReceiptLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
};

export type ManualReceiptDetails = {
  note: string;
  phone: string;
  address: string;
  lines: ManualReceiptLine[];
};

type LineDraft = {
  description?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
};

function parseScaled(raw: string, digits: number): number | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/₪/g, "");
  if (!cleaned || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > digits) return null;
  const scale = 10 ** digits;
  const padded = (frac + "0".repeat(digits)).slice(0, digits);
  const value = Number(whole) * scale + Number(padded || "0");
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

function formatScaled(value: number, digits: number): string {
  const scale = 10 ** digits;
  const whole = Math.floor(value / scale);
  const frac = String(value % scale).padStart(digits, "0");
  return `${whole}.${frac}`;
}

/** Quantity × unit price, in agorot. Zero stays zero. */
export function manualReceiptLineAmount(quantity: string, unitPrice: string): string | null {
  const qty = parseScaled(quantity, 3);
  const price = parseScaled(unitPrice, 2);
  if (qty == null || price == null) return null;
  const numerator = qty * price;
  const amount = Math.floor((numerator + 500) / 1000);
  if (!Number.isSafeInteger(amount)) return null;
  return formatScaled(amount, 2);
}

function blankLine(row: LineDraft): boolean {
  return !String(row.description ?? "").trim() && !String(row.quantity ?? "").trim() && !String(row.unitPrice ?? "").trim();
}

export function parseManualReceiptLines(raw: unknown): { lines: ManualReceiptLine[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "נדרשת לפחות שורת חשבונית אחת" };
  const lines: ManualReceiptLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "שורת חשבונית לא תקינה" };
    const row = item as LineDraft;
    if (blankLine(row)) continue;
    const quantity = String(row.quantity ?? "").trim();
    const unitPrice = String(row.unitPrice ?? "").trim();
    if (quantity.startsWith("-") || unitPrice.startsWith("-")) return { error: "כמות ומחיר לא יכולים להיות שליליים" };
    const amount = manualReceiptLineAmount(quantity, unitPrice);
    if (!amount) return { error: "סכום שורה לא תקין" };
    lines.push({
      description: String(row.description ?? "").trim(),
      quantity: canonicalQuantity(quantity),
      unitPrice: formatScaled(parseScaled(unitPrice, 2) ?? 0, 2),
      amount,
    });
  }
  if (lines.length === 0) return { error: "נדרשת לפחות שורת חשבונית אחת" };
  return { lines };
}

function canonicalQuantity(quantity: string): string {
  const formatted = formatScaled(parseScaled(quantity, 3) ?? 0, 3);
  if (formatted.endsWith(".000")) return formatted.slice(0, -4) || "0";
  return formatted.replace(/0+$/, "").replace(/\.$/, "");
}

export function sumManualReceiptLines(lines: ManualReceiptLine[]): string {
  return lines.reduce((sum, line) => addMoney(sum, line.amount), "0.00");
}

export function quoteManualReceipt(input: {
  lines: ManualReceiptLine[];
  mode: ManualVatMode;
  vatDeductible: boolean;
}) {
  return computeManualReceiptVat({
    enteredAmount: sumManualReceiptLines(input.lines),
    mode: input.mode,
    vatDeductible: input.vatDeductible,
  });
}

export function encodeManualReceiptDetails(details: ManualReceiptDetails): string {
  return JSON.stringify({
    v: 1,
    marker: MARKER,
    note: details.note,
    phone: details.phone,
    address: details.address,
    lines: details.lines,
  });
}

export function decodeManualReceiptDetails(raw: string | null | undefined): ManualReceiptDetails {
  const empty = { note: "", phone: "", address: "", lines: [] as ManualReceiptLine[] };
  if (!raw?.trim()) return empty;
  try {
    const parsed = JSON.parse(raw) as {
      marker?: string;
      note?: unknown;
      phone?: unknown;
      address?: unknown;
      lines?: ManualReceiptLine[];
    };
    if (parsed.marker !== MARKER || !Array.isArray(parsed.lines)) {
      return { ...empty, note: raw };
    }
    return {
      note: typeof parsed.note === "string" ? parsed.note : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      address: typeof parsed.address === "string" ? parsed.address : "",
      lines: parsed.lines,
    };
  } catch {
    return { ...empty, note: raw };
  }
}
