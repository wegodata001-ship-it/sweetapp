/**
 * מטבע ל־PDF — מחרוזת LTR אחידה (₪ ואז מספר) בלי תווי bidi, ספרות ASCII ב־en-US.
 * חובה לשרטט עם גופן Unicode (למשל Noto Sans Hebrew VF), לא Helvetica.
 */
export function formatCurrencyILS(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `₪\u00A0${formatted}`;
}

export function formatDateIL(d: Date | null | undefined): string {
  if (!d || !Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
