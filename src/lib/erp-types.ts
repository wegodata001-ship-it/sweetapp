export type SourceType =
  | "INVOICE"
  | "Z_REPORT"
  | "PURCHASE_ORDER"
  | "PAYROLL"
  | "MANUAL_ADJUSTMENT";

export type CurrencyCode = "USD" | "EUR" | "GBP";

export type TransactionDirection = "INFLOW" | "OUTFLOW";

export type OriginDocument = {
  id: string;
  sourceType: SourceType;
  documentNumber: string;
  counterparty: string;
  issuedAt: string;
};

export type FinancialTransaction = {
  id: string;
  amount: number;
  currency: CurrencyCode;
  direction: TransactionDirection;
  ledgerAccount: string;
  postedAt: string;
  Source_Type: SourceType;
  Source_ID: OriginDocument["id"];
  memo: string;
};

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";

export type IncomeDocument = OriginDocument & {
  sourceType: "INVOICE";
  status: InvoiceStatus;
  dueAt: string;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};
