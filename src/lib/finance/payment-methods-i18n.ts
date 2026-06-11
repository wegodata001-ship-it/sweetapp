import type { TranslateFn } from "@/lib/i18n/translator";

/** מפתחות i18n לאמצעי תשלום — הערכים ב-DB נשארים באנגלית */
export const PAYMENT_METHOD_I18N: Record<string, string> = {
  CASH: "paymentMethods.CASH",
  CREDIT: "paymentMethods.CREDIT",
  TRANSFER: "paymentMethods.TRANSFER",
  BANK: "paymentMethods.TRANSFER",
  CHECK: "paymentMethods.CHECK",
  OTHER: "paymentMethods.OTHER",
  BIT: "paymentMethods.BIT",
  CASH_REGISTER: "paymentMethods.CASH_REGISTER",
};

/** מנרמל ערך DB / טקסט חופשי למפתח i18n */
export function normalizePaymentMethodKey(raw: string | null | undefined): string | null {
  const k = (raw ?? "").trim();
  if (!k) return null;
  const upper = k.toUpperCase();
  if (PAYMENT_METHOD_I18N[upper]) return upper;
  if (upper === "CASH_REGISTER" || /cash_register/i.test(k)) return "CASH_REGISTER";
  if (/^מזומן$/i.test(k) || /^cash$/i.test(k) || /מזומן/i.test(k)) return "CASH";
  if (/^אשראי$/i.test(k) || /^credit$/i.test(k) || /אשראי/i.test(k)) return "CREDIT";
  if (/^ביט$/i.test(k) || /^bit$/i.test(k)) return "BIT";
  if (/העבר|בנק|transfer|bank/i.test(k)) return "TRANSFER";
  if (/צ.?ק|check/i.test(k)) return "CHECK";
  if (/^אחר$/i.test(k) || /^other$/i.test(k)) return "OTHER";
  return null;
}

export function translatePaymentMethod(raw: string | null | undefined, t: TranslateFn): string | null {
  const k = (raw ?? "").trim();
  if (!k) return null;
  const key = normalizePaymentMethodKey(k);
  if (key && PAYMENT_METHOD_I18N[key]) return t(PAYMENT_METHOD_I18N[key]);
  return k;
}
