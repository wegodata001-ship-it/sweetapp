import { DOCUMENT_TYPE_OPTIONS } from "@/lib/finance/document-payload";
import type { TranslateFn } from "@/lib/i18n/translator";

/** ערך נשמר במסמך (עברית) — תצוגה לפי locale */
export const DOCUMENT_TYPE_I18N: Record<(typeof DOCUMENT_TYPE_OPTIONS)[number], string> = {
  "חשבונית מס": "register.documentTypes.taxInvoice",
  "חשבונית מס קבלה": "register.documentTypes.taxInvoiceReceipt",
  "תעודת משלוח": "register.documentTypes.deliveryNote",
  "הזמנה": "register.documentTypes.order",
  "הצעת מחיר": "register.documentTypes.quote",
  "חשבונית זיכוי": "register.documentTypes.creditNote",
  "דרישת תשלום": "register.documentTypes.paymentDemand",
};

export function getDocumentTypeOptions(t: TranslateFn): { value: string; label: string }[] {
  return DOCUMENT_TYPE_OPTIONS.map((value) => ({
    value,
    label: t(DOCUMENT_TYPE_I18N[value] ?? value),
  }));
}
