import { installLatinDigits } from "./latin-digits";

installLatinDigits();

export const WEGO_LOCALE_COOKIE = "wego-locale";

/** נתמך בממשק; en מוכן ל-LTR בעתיד */
export const SUPPORTED_LOCALES = ["he", "ar", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export function isRtlLocale(locale: AppLocale): boolean {
  return locale === "he" || locale === "ar";
}

export function localeToBcp47(locale: AppLocale): string {
  if (locale === "ar") return "ar-u-nu-latn";
  if (locale === "en") return "en-US";
  return "he-IL";
}

/** True for "ar" and for tags such as ar-EG / ar-u-nu-latn. */
export function isArabicTag(tag: string | null | undefined): boolean {
  return typeof tag === "string" && /^ar\b/i.test(tag.trim());
}

export function normalizeLocale(raw: string | undefined | null): AppLocale {
  const v = (raw ?? "he").trim().toLowerCase();
  if (v === "ar" || v.startsWith("ar")) return "ar";
  if (v === "en" || v.startsWith("en")) return "en";
  return "he";
}
