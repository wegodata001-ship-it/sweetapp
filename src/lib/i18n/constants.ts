export const WEGO_LOCALE_COOKIE = "wego-locale";

/** נתמך בממשק; en מוכן ל-LTR בעתיד */
export const SUPPORTED_LOCALES = ["he", "ar", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isRtlLocale(locale: AppLocale): boolean {
  return locale === "he" || locale === "ar";
}

export function localeToBcp47(locale: AppLocale): string {
  if (locale === "ar") return "ar-SA";
  if (locale === "en") return "en-US";
  return "he-IL";
}

export function normalizeLocale(raw: string | undefined | null): AppLocale {
  const v = (raw ?? "he").trim().toLowerCase();
  if (v === "ar" || v.startsWith("ar")) return "ar";
  if (v === "en" || v.startsWith("en")) return "en";
  return "he";
}
