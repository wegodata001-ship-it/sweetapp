/** תצוגת יומן תזרים בלבד — ללא יתרות לקוח */

const CUID_LIKE = /\b[c][abcdefghijklmnopqrstuvwxyz0123456789]{15,}\b/gi;

/** הסרת מזהים ארוכים וסימני מקף דקורטיביים מתיאור לתצוגה */
export function sanitizeCashFlowDescription(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  let t = s.replace(CUID_LIKE, "").replace(/#{3,}/g, "").replace(/\?{3,}/g, "");
  t = t.replace(/\s{2,}/g, " ").replace(/\s+$/gm, "").trim();
  if (/^\s*$/.test(t)) return "—";
  return t;
}

const METHOD_PRESETS: Record<string, { emoji: string; label: string }> = {
  CASH: { emoji: "💵", label: "מזומן" },
  CREDIT: { emoji: "💳", label: "אשראי" },
  BIT: { emoji: "📱", label: "ביט" },
  BANK: { emoji: "🏦", label: "העברה בנקאית" },
  CHECK: { emoji: "📝", label: "צ׳ק" },
  /** סיכום דוח Z כשורה אחת */
  CASH_REGISTER: { emoji: "🧾", label: "קופה" },
};

export function paymentMethodPill(raw: string | null | undefined): { emoji: string; label: string } | null {
  const k = (raw ?? "").trim();
  if (!k) return null;
  const upper = k.toUpperCase();
  if (METHOD_PRESETS[upper]) return METHOD_PRESETS[upper];
  if (upper === "CASH_REGISTER" || /cash_register/i.test(k)) return METHOD_PRESETS.CASH_REGISTER;
  if (/מזומן|cash/i.test(k)) return METHOD_PRESETS.CASH;
  if (/אשראי|credit/i.test(k)) return METHOD_PRESETS.CREDIT;
  if (/ביט|bit/i.test(k)) return METHOD_PRESETS.BIT;
  if (/העבר|בנק|bank|transfer/i.test(k)) return METHOD_PRESETS.BANK;
  if (/צ.?ק|check/i.test(k)) return METHOD_PRESETS.CHECK;
  return { emoji: "💰", label: k };
}
