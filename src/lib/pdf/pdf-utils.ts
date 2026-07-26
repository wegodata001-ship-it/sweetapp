/**
 * Value formatting shared by every PDF. Numbers, money and dates are always emitted as
 * Western digits in a left-to-right form, because an amount or an invoice number must read
 * identically in Hebrew, Arabic and English documents.
 */

/** Wraps a value so surrounding right-to-left text cannot reorder its parts. */
const LRM = "\u200E";

/**
 * Forces `text` to be laid out left-to-right as a unit.
 *
 * Needed for anything signed or punctuated: the Unicode Bidi Algorithm treats "-", "+", "/"
 * and ":" as neutral, so inside a Hebrew or Arabic line "-2" would correctly-but-uselessly
 * render as "2-". Numbers, amounts, dates and identifiers must always read the same way.
 */
export function ltrIsolate(text: string): string {
  const raw = String(text ?? "");
  return raw ? `${LRM}${raw}${LRM}` : "";
}

/** Signed number that keeps its sign on the left in every language. */
export function formatSigned(value: number, fractionDigits = 0): string {
  const safe = Number.isFinite(value) ? value : 0;
  const body = fractionDigits > 0 ? formatNumber(safe, fractionDigits) : String(safe);
  return ltrIsolate(body);
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: "₪",
  USD: "$",
  EUR: "€",
  TRY: "₺",
  JOD: "JOD",
  GBP: "£",
};

export function currencySymbol(currency: string | null | undefined): string {
  const code = (currency ?? "ILS").trim().toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function formatNumber(value: number, fractionDigits = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatQuantity(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  // Whole counts should not show ".00" in an inventory report.
  return Number.isInteger(safe) ? String(safe) : formatNumber(safe, 2);
}

/**
 * Money as `<symbol><amount>`, isolated with a left-to-right mark so that a right-to-left
 * line never renders "250₪" as "₪250" or splits a negative sign from its number.
 */
export function formatMoney(
  value: number,
  currency: string | null | undefined = "ILS",
  fractionDigits = 2,
): string {
  const safe = Number.isFinite(value) ? value : 0;
  const symbol = currencySymbol(currency);
  const sign = safe < 0 ? "-" : "";
  const body = formatNumber(Math.abs(safe), fractionDigits);
  return `${LRM}${sign}${symbol}\u00A0${body}${LRM}`;
}

export function formatPercent(value: number, fractionDigits = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${LRM}${formatNumber(safe, fractionDigits)}%${LRM}`;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Dates use an unambiguous dd/MM/yyyy form in every locale. */
export function formatDate(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${LRM}${dd}/${mm}/${date.getFullYear()}${LRM}`;
}

export function formatDateTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${formatDate(date)} ${LRM}${hh}:${mi}${LRM}`;
}

/** Identifiers such as INV-00015 must never be reordered by bidi. */
export function formatIdentifier(value: string | number | null | undefined): string {
  const raw = String(value ?? "").trim();
  return raw ? `${LRM}${raw}${LRM}` : "";
}

/** Makes a string safe for use inside a download file name. */
export function safeFileNamePart(value: string, fallback = "document"): string {
  const cleaned = (value ?? "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}
