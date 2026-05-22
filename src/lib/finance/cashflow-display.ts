/** תצוגת יומן תזרים בלבד — ללא יתרות לקוח */

import type { CashFlowRow } from "@/lib/finance/types";
import { EXPENSE_TYPE_I18N, isExpenseType } from "@/lib/finance/expense-types";
import type { TranslateFn } from "@/lib/i18n/translator";

const CUID_LIKE = /\b[c][abcdefghijklmnopqrstuvwxyz0123456789]{15,}\b/gi;

const EXPENSE_ENTRY_TYPES = new Set([
  "expense",
  "refund",
  "supplier_payment",
  "salary",
  "deposit_refund",
]);

export type CashflowDisplayKind = "income" | "expense" | "transfer";

export function isZReportCashFlowRow(row: CashFlowRow): boolean {
  return row.source === "z_report" || Boolean(row.z_report_id);
}

export function getCashflowDisplayKind(row: CashFlowRow): CashflowDisplayKind {
  const et = (row.entry_type ?? "").trim().toLowerCase();
  if (EXPENSE_ENTRY_TYPES.has(et)) return "expense";
  if (et === "deposit") return "transfer";
  if (et === "income" || isZReportCashFlowRow(row)) return "income";
  return "transfer";
}

export function getCashflowTypeSublabel(row: CashFlowRow, t: TranslateFn): string | null {
  if (isZReportCashFlowRow(row)) return t("cashflow.subtypeZ");
  if (row.entry_type?.toLowerCase() === "deposit") return t("cashflow.subtypeDeposit");
  const et = row.expense_type;
  if (et && isExpenseType(et)) return t(EXPENSE_TYPE_I18N[et]);
  return null;
}

export function formatCashflowDescriptionLines(
  raw: string | null | undefined,
): { primary: string; secondary: string | null } {
  let s = (raw ?? "").trim();
  if (!s) return { primary: "—", secondary: null };
  s = s
    .replace(CUID_LIKE, "")
    .replace(/#{3,}/g, "")
    .replace(/\?{3,}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!s) return { primary: "—", secondary: null };

  s = s
    .replace(/^יציאה\s*\(חובה\)\s*/i, "")
    .replace(/^כניסה\s*\(זכות\)\s*/i, "")
    .replace(/^פיקדון\s*/i, "")
    .replace(/^עבור\s+/i, "")
    .trim();

  const dashParts = s.split(/\s*[—–]\s*/).map((p) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2 && dashParts[0].length <= 48) {
    return {
      primary: dashParts[0],
      secondary: dashParts.slice(1).join(" — ") || null,
    };
  }

  const docMatch = s.match(/^(.{2,28}?)\s+(.+)$/);
  if (docMatch && /חשבונית|הזמנה|תעודת|דוח|فاتورة|طلب/i.test(docMatch[1])) {
    return { primary: docMatch[2].trim(), secondary: docMatch[1].trim() };
  }

  if (s.length > 52) {
    return { primary: `${s.slice(0, 52)}…`, secondary: null };
  }
  return { primary: s, secondary: null };
}

export const CASHFLOW_KIND_BADGE: Record<
  CashflowDisplayKind,
  string
> = {
  income: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  expense: "bg-rose-50 text-rose-800 ring-rose-100",
  transfer: "bg-sky-50 text-sky-800 ring-sky-100",
};

export const CASHFLOW_KIND_LABEL_KEY: Record<CashflowDisplayKind, string> = {
  income: "cashflow.typeIncome",
  expense: "cashflow.typeExpense",
  transfer: "cashflow.typeTransfer",
};

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

/** תווית אמצעי תשלום לטבלה — בלי אימוג'י */
export function paymentMethodLabel(raw: string | null | undefined): string | null {
  return paymentMethodPill(raw)?.label ?? null;
}
