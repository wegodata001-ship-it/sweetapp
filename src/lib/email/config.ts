export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** הגדרות Resend — שרת בלבד */
export function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.MAIL_FROM?.trim() || "noreply@halawiyatquds.com";
  const fromName = process.env.MAIL_FROM_NAME?.trim() || "WEGO BUSINESS ERP";
  const appUrl = (process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://halawiyatquds.com").replace(/\/$/, "");

  return {
    apiKey,
    from: `${fromName} <${fromEmail}>`,
    fromEmail,
    fromName,
    appUrl,
    enabled: Boolean(apiKey),
  };
}

export function isDeliverableEmail(email: string | null | undefined): boolean {
  const e = email?.trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  if (e.endsWith("@employees.local")) return false;
  if (e.startsWith("nid-") && e.includes("@employees")) return false;
  return true;
}
