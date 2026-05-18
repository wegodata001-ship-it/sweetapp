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
