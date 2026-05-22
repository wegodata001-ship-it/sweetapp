"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  WEGO_LOCALE_COOKIE,
  isRtlLocale,
  localeToBcp47,
  normalizeLocale,
  type AppLocale,
} from "@/lib/i18n/constants";
import { createTranslator, type Messages, type TranslateFn } from "@/lib/i18n/translator";

type I18nContextValue = {
  locale: AppLocale;
  dir: "rtl" | "ltr";
  setLocale: (next: AppLocale, opts?: { persistRemote?: boolean }) => Promise<void>;
  t: TranslateFn;
  bcp47: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readCookieLocaleRaw(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(new RegExp(`(?:^|; )${WEGO_LOCALE_COOKIE}=([^;]*)`));
  if (!m?.[1]) return undefined;
  return decodeURIComponent(m[1]);
}

function readCookieLocale(): AppLocale {
  if (typeof document === "undefined") return "he";
  return normalizeLocale(readCookieLocaleRaw());
}

function readStorageLocale(): AppLocale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WEGO_LOCALE_COOKIE);
    if (!raw) return null;
    return normalizeLocale(raw);
  } catch {
    return null;
  }
}

function writeCookieLocale(locale: AppLocale) {
  const maxAge = 60 * 60 * 24 * 400;
  document.cookie = `${WEGO_LOCALE_COOKIE}=${encodeURIComponent(locale)};path=/;max-age=${maxAge};SameSite=Lax`;
  try {
    window.localStorage.setItem(WEGO_LOCALE_COOKIE, locale);
  } catch {
    /* ignore */
  }
}

function applyDomLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  document.documentElement.lang = localeToBcp47(locale);
  document.documentElement.dir = dir;
  const body = document.body;
  if (body) {
    body.classList.remove("locale-he", "locale-ar", "locale-en");
    body.classList.add(`locale-${locale}`);
  }
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** From `cookies()` in root layout — must match SSR so client hydration agrees. */
  initialLocale: AppLocale;
}) {
  const router = useRouter();
  const { user, loading, refresh: refreshAuth } = useAuth();
  const boot = normalizeLocale(initialLocale);
  const [locale, setLocaleState] = useState<AppLocale>(boot);
  const userIdRef = useRef<string | null>(null);

  // After navigation / `router.refresh()`, layout may pass an updated cookie locale.
  useEffect(() => {
    const n = normalizeLocale(initialLocale);
    setLocaleState((prev) => (n === prev ? prev : n));
  }, [initialLocale]);

  const [devMessages, setDevMessages] = useState<Messages | null>(null);

  /** בפיתוח — טוען JSON מהדיסק כדי שעדכוני locales/ar.json יופיעו בלי restart */
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    void fetch(`/api/dev/messages?locale=${encodeURIComponent(locale)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setDevMessages(data as Messages);
      })
      .catch(() => {
        if (!cancelled) setDevMessages(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useMemo(() => createTranslator(locale, devMessages ?? undefined), [locale, devMessages]);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const bcp47 = localeToBcp47(locale);

  const setLocale = useCallback(
    async (next: AppLocale, opts?: { persistRemote?: boolean }) => {
      const n = normalizeLocale(next);
      if (n === locale) return;
      setLocaleState(n);
      writeCookieLocale(n);
      applyDomLocale(n);
      const persist = opts?.persistRemote !== false;
      if (persist && user) {
        try {
          await fetch("/api/me/language", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ language: n }),
          });
          await refreshAuth();
        } catch {
          /* ignore */
        }
      }
      router.refresh();
    },
    [router, user, refreshAuth, locale],
  );

  // Sync DOM whenever the locale state changes.
  useEffect(() => {
    applyDomLocale(locale);
  }, [locale]);

  // On mount: if there is no locale cookie, apply localStorage (SSR cannot see it).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawCookie = readCookieLocaleRaw();
    const fromStorage = readStorageLocale();
    const desired =
      rawCookie != null && rawCookie.trim() !== ""
        ? normalizeLocale(rawCookie)
        : fromStorage ?? locale;

    if (desired !== locale) {
      setLocaleState(desired);
      writeCookieLocale(desired);
    } else {
      writeCookieLocale(locale);
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When auth user becomes available, sync to their persisted language only the first time we see them.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      userIdRef.current = null;
      return;
    }
    if (userIdRef.current === user.id) return;
    userIdRef.current = user.id;
    const fromUser = normalizeLocale(user.language);
    if (fromUser !== locale) {
      setLocaleState(fromUser);
      writeCookieLocale(fromUser);
      applyDomLocale(fromUser);
      router.refresh();
    }
  }, [loading, user, locale, router]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir,
      setLocale,
      t,
      bcp47,
    }),
    [locale, dir, setLocale, t, bcp47],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

/** Shortcut hook returning just the translation function. */
export function useT(): TranslateFn {
  return useI18n().t;
}
