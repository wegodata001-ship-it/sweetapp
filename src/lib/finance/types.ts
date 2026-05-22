import type { FinanceDocumentPayload } from "@/lib/finance/document-payload";

export type EntityType = "supplier" | "customer" | "employee";

/** סיכום שורה ברשימת כרטסות מאוחדת */
export type LedgerOverviewRow = {
  entity_type: EntityType;
  id: string;
  name: string;
  opening_balance: number;
  /** לקוח: מחושב בזמן אמת ממסמכי הכנסה פחות תשלומים; ספק/עובד: יתרה נטו מכרטסת ידנית */
  open_balance: number;
  total_debit: number;
  total_credit: number;
  movement_count: number;
};

export type FinanceEntityRow = {
  id: string;
  entity_type: EntityType;
  name: string;
  opening_balance: number;
};

export type LedgerEntryRow = {
  id: string;
  entity_id: string;
  entry_date: string;
  doc_type: string;
  description: string;
  debit: number;
  credit: number;
};

export type LedgerMovementView = LedgerEntryRow & {
  entity_name: string;
  entity_type: EntityType;
  document_id?: string | null;
  open_balance?: number;
  /** Optional calculated delta for the running balance when displayed debit/credit are informational. */
  balance_delta?: number;
};

export type CashFlowRow = {
  id: string;
  entry_date: string;
  description: string;
  entry_type?: string;
  payment_method?: string | null;
  payment_id?: string | null;
  document_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  /** מקור התנועה ב־DB, למשל z_report */
  source?: string | null;
  z_report_id?: string | null;
  inflow: number;
  outflow: number;
  is_direct: boolean;
  /** סוג הוצאה — ממסמך הרשמה (SUPPLIER_PAYMENTS וכו׳) */
  expense_type?: string | null;
};

export type FinanceDocumentRow = {
  id: string;
  title: string;
  category: string;
  document_type: string;
  customer_id: string | null;
  customer_name?: string | null;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_status: string;
  deposit_amount: number;
  deposit_type?: string | null;
  deposit_note?: string | null;
  deposit_status?: string | null;
  doc_date: string | null;
  /** Legacy PDF path; may be empty when document is DB-only. */
  pdf_storage_path: string | null;
  sent_to_cpa: boolean;
  sent_to_cpa_at: string | null;
  sent_to_cpa_by: { id: string; full_name: string } | null;
  created_at: string;
  payload: FinanceDocumentPayload | null;
};

export type AccountantTransferLogRow = {
  id: string;
  document_id: string;
  /** marked_sent | marked_not_sent */
  action: "marked_sent" | "marked_not_sent";
  performed_by: { id: string; full_name: string } | null;
  created_at: string;
};
