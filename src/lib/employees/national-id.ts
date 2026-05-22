/**
 * עזרי תעודת זהות.
 *
 * - normalizeNationalId: מסיר רווחים/מקפים ומחזיר רק ספרות.
 * - isValidNationalId: בדיקה רכה (7–10 ספרות) — מתאים גם לזרים/מסמכים זרים.
 *   לא אוכפים check-digit ישראלי כדי לא לחסום עובדים זרים/דרכון.
 * - looksLikeEmail: עוזר ב־UI/login להבחין בין מזהים.
 */

export function normalizeNationalId(input: string | null | undefined): string {
  if (!input) return "";
  return String(input).replace(/\D+/g, "");
}

/** וריאציות ת.ז. לחיפוש — 8/9 ספרות, עם/בלי 0 מוביל */
export function nationalIdLookupVariants(input: string | null | undefined): string[] {
  const n = normalizeNationalId(input);
  if (!n) return [];
  const out = new Set<string>([n]);
  if (n.length === 8) out.add(`0${n}`);
  if (n.length === 9 && !n.startsWith("0")) out.add(`0${n}`);
  if (n.length === 10 && n.startsWith("0")) out.add(n.slice(1));
  return [...out];
}

export function isValidNationalId(input: string | null | undefined): boolean {
  const v = normalizeNationalId(input);
  if (!v) return false;
  if (v.length < 5 || v.length > 12) return false;
  return /^\d+$/.test(v);
}

export function looksLikeEmail(input: string): boolean {
  return input.includes("@") && input.includes(".");
}

/**
 * יוצר אימייל פנימי כשהמנהל לא ציין אחד עבור עובד —
 * שמירה על תאימות עם עמודת email החובה ב־User בלי לחשוף PII באימייל אמיתי.
 */
export function buildInternalEmail(nationalId: string): string {
  const v = normalizeNationalId(nationalId) || "user";
  return `nid-${v}@employees.local`;
}
