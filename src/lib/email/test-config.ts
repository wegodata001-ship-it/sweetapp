/** בדיקות מייל — אופציונלי; במצב production שולח לכתובת המשתמש האמיתית */

import { isDeliverableEmail, normalizeEmail as norm } from "@/lib/email/config";

export function normalizeEmail(email: string): string {
  return norm(email);
}

export function isEmailTestMode(): boolean {
  return process.env.EMAIL_TEST_MODE === "true" || process.env.EMAIL_TEST_MODE === "1";
}

export function getEmailTestRecipient(): string | null {
  const fromEnv = process.env.EMAIL_TEST_RECIPIENT?.trim();
  if (fromEnv && isDeliverableEmail(fromEnv)) return normalizeEmail(fromEnv);
  return null;
}

/**
 * כתובת יעד לשליחה.
 * TEST MODE: כל המיילים לנמען בדיקה בלבד.
 * Production: אימייל המשתמש (אם תקין).
 */
export function resolveOutboundEmail(userEmail: string): string | null {
  if (isEmailTestMode()) {
    return getEmailTestRecipient();
  }
  const normalized = normalizeEmail(userEmail);
  if (!isDeliverableEmail(normalized)) return null;
  return normalized;
}

export function assertTestRecipient(email: string): string {
  const n = normalizeEmail(email);
  if (!isDeliverableEmail(n)) {
    throw new Error(`כתובת לא תקינה: ${email}`);
  }
  return n;
}
