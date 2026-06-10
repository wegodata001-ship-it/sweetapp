export type ForecastSourceType =
  | "opening"
  | "check_in"
  | "customer_receivable"
  | "order_receivable"
  | "expense_out"
  | "supplier_check"
  | "employee_pay"
  | "investment"
  | "external_expense"
  | "manual_income";

export type ForecastAlertLevel = "none" | "warning" | "critical";

export type CashflowForecastRow = {
  id: string;
  date: string;
  description: string;
  inflow: number | null;
  outflow: number | null;
  expectedBalance: number;
  isOpening: boolean;
  isNegative: boolean;
  alertLevel: ForecastAlertLevel;
  sourceType?: ForecastSourceType;
  sourceId?: string;
  paymentLineId?: string;
  sourceHref?: string | null;
  orderCategory?: string | null;
  canDefer: boolean;
};

export type CashflowShortage = {
  id: string;
  date: string;
  balance: number;
  shortageAmount: number;
};

export type CashflowForecastKpis = {
  openingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  closingBalance: number;
};

export type CashflowForecastResult = {
  bankBalance: number;
  dateFrom: string;
  dateTo: string;
  openingDate: string;
  rows: CashflowForecastRow[];
  shortages: CashflowShortage[];
  kpis: CashflowForecastKpis;
};

export type BuildForecastParams = {
  dateFrom?: string;
  dateTo?: string;
};
