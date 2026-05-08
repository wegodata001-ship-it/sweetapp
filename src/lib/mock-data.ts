import type { FinancialTransaction, IncomeDocument, OriginDocument } from "./erp-types";

export const originDocuments: OriginDocument[] = [
  {
    id: "inv_1008",
    sourceType: "INVOICE",
    documentNumber: "INV-2026-1008",
    counterparty: "Northwind Manufacturing",
    issuedAt: "2026-05-01",
  },
  {
    id: "zrep_0441",
    sourceType: "Z_REPORT",
    documentNumber: "ZR-0441",
    counterparty: "WEGO Retail POS",
    issuedAt: "2026-05-02",
  },
  {
    id: "po_5832",
    sourceType: "PURCHASE_ORDER",
    documentNumber: "PO-5832",
    counterparty: "Atlas Office Supplies",
    issuedAt: "2026-05-03",
  },
];

export const financialTransactions: FinancialTransaction[] = [
  {
    id: "txn_9001",
    amount: 48250,
    currency: "USD",
    direction: "INFLOW",
    ledgerAccount: "4000 - Sales Revenue",
    postedAt: "2026-05-02",
    Source_Type: "INVOICE",
    Source_ID: "inv_1008",
    memo: "Invoice payment received",
  },
  {
    id: "txn_9002",
    amount: 13740,
    currency: "USD",
    direction: "INFLOW",
    ledgerAccount: "1010 - Cash Drawer",
    postedAt: "2026-05-02",
    Source_Type: "Z_REPORT",
    Source_ID: "zrep_0441",
    memo: "Daily POS closeout",
  },
  {
    id: "txn_9003",
    amount: 6210,
    currency: "USD",
    direction: "OUTFLOW",
    ledgerAccount: "6100 - Office Operations",
    postedAt: "2026-05-04",
    Source_Type: "PURCHASE_ORDER",
    Source_ID: "po_5832",
    memo: "Operations supplies purchase",
  },
];

export const incomeDocuments: IncomeDocument[] = [
  {
    id: "inv_1008",
    sourceType: "INVOICE",
    documentNumber: "INV-2026-1008",
    counterparty: "Northwind Manufacturing",
    issuedAt: "2026-05-01",
    dueAt: "2026-05-31",
    status: "SENT",
    lineItems: [
      {
        id: "line_1",
        description: "ERP implementation milestone",
        quantity: 1,
        unitPrice: 48250,
      },
    ],
  },
];

export const dashboardStats = {
  income: 61990,
  expenses: 6210,
  cashflow: 55780,
  openInvoices: 12,
  overdueInvoices: 2,
};
