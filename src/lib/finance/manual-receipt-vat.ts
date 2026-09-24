import { VAT_RATE } from "@/lib/finance/document-payload";

/** How the user entered the amount. Deductibility is a separate flag. */
export type ManualVatMode = "includes_vat" | "before_vat" | "no_vat";

export const MANUAL_VAT_MODES: ManualVatMode[] = ["includes_vat", "before_vat", "no_vat"];

export const MANUAL_DOCUMENT_TYPES = [
  "חשבונית מס",
  "חשבונית מס / קבלה",
  "קבלה",
  "חשבונית עסקה",
  "אחר",
] as const;

export type ManualReceiptVat = {
  amountBeforeVat: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  vatDeductibleAmount: string;
};

/** Central system VAT rate. Components must not hardcode a rate. */
export function systemVatRate(): number {
  return VAT_RATE;
}

function parseAmountToAgorot(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "").replace(/₪/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole, frac = ""] = unsigned.split(".");
  const agorot = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(agorot)) return null;
  return negative ? -agorot : agorot;
}

function formatAgorot(agorot: number): string {
  const negative = agorot < 0;
  const abs = Math.abs(agorot);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error("invalid vat divisor");
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

/**
 * Split an entered amount into net, VAT, and total using integer agorot.
 * Rate comes from the system VAT setting unless a test passes an override.
 */
export function computeManualReceiptVat(input: {
  enteredAmount: string;
  mode: ManualVatMode;
  vatDeductible: boolean;
  rate?: number;
}): ManualReceiptVat | null {
  const entered = parseAmountToAgorot(input.enteredAmount);
  if (entered == null || entered < 0) return null;
  const rate = input.rate ?? systemVatRate();
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) return null;
  const rateBps = Math.round(rate * 10000);
  const scale = 10000;

  let net = entered;
  let vat = 0;
  let total = entered;

  if (input.mode === "no_vat") {
    net = entered;
    vat = 0;
    total = entered;
  } else if (input.mode === "includes_vat") {
    total = entered;
    net = divRoundHalfUp(total * scale, scale + rateBps);
    vat = total - net;
  } else {
    net = entered;
    vat = divRoundHalfUp(net * rateBps, scale);
    total = net + vat;
  }

  const deductible = input.vatDeductible ? vat : 0;
  return {
    amountBeforeVat: formatAgorot(net),
    vatRate: rate.toFixed(4),
    vatAmount: formatAgorot(vat),
    totalAmount: formatAgorot(total),
    vatDeductibleAmount: formatAgorot(deductible),
  };
}

export function addMoney(a: string, b: string): string {
  return addAgorot(a, b, 1);
}

export function subtractMoney(a: string, b: string): string {
  return addAgorot(a, b, -1);
}

function addAgorot(a: string, b: string, sign: 1 | -1): string {
  const left = parseAmountToAgorot(a) ?? 0;
  const right = parseAmountToAgorot(b) ?? 0;
  return formatAgorot(left + sign * right);
}

/** A linked manual receipt is the VAT source. It must not create another expense movement. */
export function createsExpenseMovement(): boolean {
  return false;
}

export function inputVatFromReceipts(
  receipts: Array<{ vatDeductibleAmount: string }>,
): string {
  return receipts.reduce((sum, row) => addMoney(sum, row.vatDeductibleAmount), "0.00");
}
