/** ערכי DB: paid | partial | unpaid (תמיכה ב־UNPAID/PAID/PARTIAL ישנים) */
export function paymentStatusLabelHe(raw: string | null | undefined): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "paid") return "שולם";
  if (s === "partial") return "תשלום חלקי";
  if (s === "unpaid") return "לא שולם";
  const legacy = (raw ?? "").trim();
  if (legacy === "PAID") return "שולם";
  if (legacy === "PARTIAL") return "תשלום חלקי";
  if (legacy === "UNPAID") return "לא שולם";
  return legacy || "לא ידוע";
}
