import type { AppLocale } from "./constants";
import { normalizeLocale } from "./constants";
import ar from "../../../locales/ar.json";
import en from "../../../locales/en.json";
import he from "../../../locales/he.json";

export type Messages = typeof he;

const catalogs: Record<AppLocale, Messages> = {
  he,
  ar: ar as Messages,
  en: en as Messages,
};

function dig(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/** Server / Node-safe translator — no React. Optional messages override (dev hot reload). */
export function createTranslator(locale: AppLocale, messagesOverride?: Messages): TranslateFn {
  const loc = normalizeLocale(locale);
  const messages = messagesOverride ?? catalogs[loc] ?? he;
  const fallback = catalogs.he;
  return function t(key: string, vars?: Record<string, string | number>): string {
    let raw = dig(messages, key);
    if (typeof raw !== "string") raw = dig(fallback, key);
    let out = typeof raw === "string" ? raw : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{{${k}}}`).join(String(v));
      }
    }
    return out;
  };
}

export { normalizeLocale };
