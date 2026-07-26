import { ltrIsolate } from "./pdf-utils";

/**
 * מטבע ל־PDF — מחרוזת LTR אחידה (₪ ואז מספר), ספרות ASCII ב־en-US.
 * מבודד ב־LRM כדי שסימן מינוס לא יעבור לצד השני בשורה בעברית או בערבית.
 */
export function formatCurrencyILS(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return ltrIsolate(`₪\u00A0${formatted}`);
}

export function formatDateIL(d: Date | null | undefined): string {
  if (!d || !Number.isFinite(d.getTime())) return "—";
  return ltrIsolate(
    new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d),
  );
}
