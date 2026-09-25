/**
 * Arabic UI stays Arabic and right-to-left, but amounts, dates and counts
 * always use Western digits (0-9), never Arabic-Indic (٠-٩).
 *
 * Installed once for the whole process. Every Intl number and date formatter
 * is forced onto numberingSystem "latn", including ar-EG / ar-IL and calls
 * that omit a locale.
 */

const ARABIC_INDIC = /[\u0660-\u0669\u06F0-\u06F9]/;
const ALREADY_LATIN = /(?:^|-)nu-latn(?:-|$)/i;

export function hasArabicIndicDigits(value: string): boolean {
  return ARABIC_INDIC.test(value);
}

export function withLatinDigits(locale: string): string {
  const tag = locale.trim();
  if (!/^ar\b/i.test(tag) || ALREADY_LATIN.test(tag)) return tag;
  if (/-u-/i.test(tag)) return tag.replace(/-u-/i, "-u-nu-latn-");
  return `${tag}-u-nu-latn`;
}

function mapLocales(locales: Intl.LocalesArgument): Intl.LocalesArgument {
  if (locales == null) return locales;
  if (typeof locales === "string") return withLatinDigits(locales);
  if (Array.isArray(locales)) return locales.map((tag) => withLatinDigits(String(tag)));
  if (typeof locales === "object" && "baseName" in locales) {
    return withLatinDigits(locales.toString());
  }
  return locales;
}

function withLatinNumbering<T extends object | undefined>(options: T): T {
  return { ...(options ?? {}), numberingSystem: "latn" } as T;
}

/** Arabic percent sign (٪) is not a digit, but the UI still shows 18%. */
function westernPercent(value: string): string {
  return value.replace(/\u066A/g, "%");
}

function withWesternPercent(formatter: Intl.NumberFormat): Intl.NumberFormat {
  const format = formatter.format.bind(formatter);
  return new Proxy(formatter, {
    get(target, prop, receiver) {
      if (prop === "format") {
        return (value: number) => westernPercent(format(value));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

let installed = false;

/** Rewrites every Intl number/date formatter so the digits are 0-9. */
export function installLatinDigits(): void {
  if (installed || typeof Intl === "undefined") return;
  installed = true;

  const OriginalNumberFormat = Intl.NumberFormat;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;

  function NumberFormat(
    this: Intl.NumberFormat,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ) {
    return withWesternPercent(new OriginalNumberFormat(mapLocales(locales), withLatinNumbering(options)));
  }
  NumberFormat.prototype = OriginalNumberFormat.prototype;
  NumberFormat.supportedLocalesOf = OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
  Object.setPrototypeOf(NumberFormat, OriginalNumberFormat);
  Intl.NumberFormat = NumberFormat as unknown as typeof Intl.NumberFormat;

  function DateTimeFormat(
    this: Intl.DateTimeFormat,
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    return new OriginalDateTimeFormat(mapLocales(locales), withLatinNumbering(options));
  }
  DateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
  DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf.bind(OriginalDateTimeFormat);
  Object.setPrototypeOf(DateTimeFormat, OriginalDateTimeFormat);
  Intl.DateTimeFormat = DateTimeFormat as unknown as typeof Intl.DateTimeFormat;

  const Relative = Intl.RelativeTimeFormat;
  if (typeof Relative === "function") {
    function RelativeTimeFormat(
      this: Intl.RelativeTimeFormat,
      locales?: Intl.LocalesArgument,
      options?: Intl.RelativeTimeFormatOptions,
    ) {
      return new Relative(mapLocales(locales), withLatinNumbering(options));
    }
    RelativeTimeFormat.prototype = Relative.prototype;
    RelativeTimeFormat.supportedLocalesOf = Relative.supportedLocalesOf.bind(Relative);
    Object.setPrototypeOf(RelativeTimeFormat, Relative);
    Intl.RelativeTimeFormat = RelativeTimeFormat as unknown as typeof Intl.RelativeTimeFormat;
  }

  const originalNumberToLocale = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ) {
    return westernPercent(
      originalNumberToLocale.call(this, mapLocales(locales), withLatinNumbering(options)),
    );
  };

  const originalToLocaleString = Date.prototype.toLocaleString;
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleString = function (
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    return originalToLocaleString.call(this, mapLocales(locales), withLatinNumbering(options));
  };
  Date.prototype.toLocaleDateString = function (
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    return originalToLocaleDateString.call(this, mapLocales(locales), withLatinNumbering(options));
  };
  Date.prototype.toLocaleTimeString = function (
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions,
  ) {
    return originalToLocaleTimeString.call(this, mapLocales(locales), withLatinNumbering(options));
  };
}

installLatinDigits();
