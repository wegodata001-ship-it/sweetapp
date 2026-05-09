import type { FinanceDocumentPayload } from "@/lib/finance/document-payload";

export type EntityType = "supplier" | "customer" | "employee";

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
};

export type CashFlowRow = {
  id: string;
  entry_date: string;
  description: string;
  inflow: number;
  outflow: number;
  is_direct: boolean;
};

export type FinanceDocumentRow = {
  id: string;
  title: string;
  category: string;
  doc_date: string | null;
  /** Legacy PDF path; may be empty when document is DB-only. */
  pdf_storage_path: string | null;
  sent_to_cpa: boolean;
  created_at: string;
  payload: FinanceDocumentPayload | null;
};
