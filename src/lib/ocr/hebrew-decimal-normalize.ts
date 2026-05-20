import { parseNumber } from "./hebrew-invoice-table-parser";

export type MoneyRole = "quantity" | "unitPrice" | "lineTotal";

/**
 * OCR בעברית לעיתים מסיר נקודה עשרונית: 5.31→531, 84.96→8496.
 * מנסה לשחזר לפי תפקיד השדה והקשר qty×price≈total.
 */
export function normalizeOcrDecimal(
  raw: string,
  role: MoneyRole,
  ctx?: { quantity?: number; unitPrice?: number; lineTotal?: number },
): number {
  const trimmed = raw.replace(/\s/g, "").trim();
  let n = parseNumber(trimmed);
  if (!Number.isFinite(n) || n <= 0) return NaN;

  if (/[.,]\d{1,2}$/.test(trimmed) || (trimmed.includes(".") && !/^\d+,\d{3}/.test(trimmed))) {
    return n;
  }

  const digits = String(Math.floor(Math.abs(n)));
  if (digits.length < 3) return n;

  const candidates: number[] = [];

  if (digits.length >= 4) {
    const twoDec = Number.parseFloat(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
    if (Number.isFinite(twoDec)) candidates.push(twoDec);
  }
  if (digits.length === 3 && role === "unitPrice") {
    const oneDec = Number.parseFloat(`${digits[0]}.${digits.slice(1)}`);
    if (Number.isFinite(oneDec)) candidates.push(oneDec);
  }

  for (const c of candidates) {
    if (!isPlausibleForRole(c, role, ctx)) continue;
    if (ctx?.quantity && ctx?.unitPrice && role === "lineTotal") {
      const expected = ctx.quantity * ctx.unitPrice;
      if (Math.abs(expected - c) / Math.max(c, 0.01) < 0.12) return c;
    }
    if (role === "unitPrice" && c < 500) return c;
    if (role === "lineTotal" && c < 100_000) {
      if (!ctx?.quantity || !ctx?.unitPrice) return c;
      const expected = ctx.quantity * ctx.unitPrice;
      if (Math.abs(expected - n) / Math.max(n, 1) > 0.15 && Math.abs(expected - c) / Math.max(c, 1) < 0.12) {
        return c;
      }
    }
    if (role === "quantity" && c <= 500 && Number.isInteger(c)) return c;
  }

  return n;
}

function isPlausibleForRole(
  n: number,
  role: MoneyRole,
  ctx?: { quantity?: number; unitPrice?: number },
): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  if (role === "quantity") return n <= 500;
  if (role === "unitPrice") return n <= 10_000;
  if (role === "lineTotal") return n <= 100_000;
  if (ctx?.quantity && ctx?.unitPrice && role === "lineTotal") {
    return Math.abs(ctx.quantity * ctx.unitPrice - n) / Math.max(n, 1) < 0.2;
  }
  return true;
}

/** מיישם נרמול על triple אחרי חילוץ ראשוני */
export function normalizeLineTriple(
  quantity: number,
  unitPrice: number,
  lineTotal: number,
  rawTokens?: { qty?: string; price?: string; total?: string },
): { quantity: number; unitPrice: number; lineTotal: number } {
  const ctx = { quantity, unitPrice, lineTotal };
  const q = rawTokens?.qty
    ? normalizeOcrDecimal(rawTokens.qty, "quantity", ctx)
    : quantity;
  const p = rawTokens?.price
    ? normalizeOcrDecimal(rawTokens.price, "unitPrice", { quantity: q })
    : unitPrice;
  const t = rawTokens?.total
    ? normalizeOcrDecimal(rawTokens.total, "lineTotal", { quantity: q, unitPrice: p })
    : lineTotal;

  const qty = Number.isFinite(q) && q > 0 ? q : quantity;
  const price = Number.isFinite(p) && p > 0 ? p : unitPrice;
  let total = Number.isFinite(t) && t > 0 ? t : lineTotal;

  if (qty > 0 && price > 0) {
    const expected = qty * price;
    if (Math.abs(expected - total) / Math.max(total, 1) > 0.15) {
      if (Math.abs(expected - total) / Math.max(expected, 1) < 0.08) {
        total = expected;
      }
    }
  }

  return { quantity: qty, unitPrice: price, lineTotal: total };
}
