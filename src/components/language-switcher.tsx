"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n/constants";

type Props = {
  /** When no user is signed in — write cookie only, no PATCH. */
  guest?: boolean;
  className?: string;
  /** Display mode: compact pills or a professional dropdown */
  variant?: "pills" | "dropdown";
};

const FLAGS: Record<AppLocale, string> = {
  he: "🇮🇱",
  ar: "🇸🇦",
  en: "🇬🇧",
};

const NATIVE_NAMES: Record<AppLocale, string> = {
  he: "עברית",
  ar: "العربية",
  en: "English",
};

export function LanguageSwitcher({ guest, className, variant = "dropdown" }: Props) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function pick(next: AppLocale) {
    setOpen(false);
    if (next === locale) return;
    void setLocale(next, { persistRemote: !guest });
  }

  if (variant === "pills") {
    return (
      <div
        className={className ?? "flex items-center gap-1 text-xs font-bold"}
        role="group"
        aria-label={t("language.switcherAria")}
      >
        {SUPPORTED_LOCALES.map((code, idx) => (
          <span key={code} className="contents">
            {idx > 0 && (
              <span className="text-slate-300" aria-hidden>
                |
              </span>
            )}
            <button
              type="button"
              onClick={() => pick(code)}
              aria-pressed={locale === code}
              className={`rounded-full px-2 py-1 transition ${
                code === "ar" ? "font-arabic-brand" : ""
              } ${
                locale === code
                  ? "bg-luxury-gold text-luxury-charcoal"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {NATIVE_NAMES[code]}
            </button>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.switcherAria")}
        className="inline-flex h-9 min-h-[36px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
      >
        <Globe className="h-3.5 w-3.5 text-slate-500" aria-hidden />
        <span aria-hidden className="text-base leading-none">
          {FLAGS[locale]}
        </span>
        <span className={`${locale === "ar" ? "font-arabic-brand" : ""}`}>
          {NATIVE_NAMES[locale]}
        </span>
        <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={t("language.choose")}
          className="absolute end-0 z-[200] mt-1 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {SUPPORTED_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={locale === code}
              onClick={() => pick(code)}
              className={`flex w-full min-h-[40px] items-center gap-2 px-3 py-2 text-sm font-bold transition ${
                locale === code
                  ? "bg-luxury-gold/10 text-luxury-navy-rich"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {FLAGS[code]}
              </span>
              <span className={`flex-1 text-start ${code === "ar" ? "font-arabic-brand" : ""}`}>
                {NATIVE_NAMES[code]}
              </span>
              {locale === code ? (
                <Check className="h-4 w-4 text-luxury-gold" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
