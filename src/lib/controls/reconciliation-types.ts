import type { ReconStatus } from "@/lib/controls/reconciliation-constants";

/** כותרת ייבוא — שורת היסטוריה */
export type ReconImportDto = {
  id: string;
  country: string;
  weekCode: string;
  fileName: string;
  importedAt: string;
  importedByName: string | null;
  totalRows: number;
  /** האם בוצעה התאמה (קיימת לפחות שורה לא PENDING) */
  matched: boolean;
};

/** שורת התאמה לתצוגה */
export type ReconRowDto = {
  id: string;
  customerCode: string | null;
  customerName: string | null;
  externalOrderId: string | null;
  wegoOrderId: string | null;
  wegoOrderNumber: number | null;
  externalAmount: number | null;
  wegoAmount: number | null;
  difference: number | null;
  externalDate: string | null;
  status: ReconStatus;
};

/** מדדי KPI */
export type ReconKpis = {
  total: number;
  matched: number;
  differences: number;
  missingInWego: number;
  missingInExternal: number;
};

/** תשובת פירוט ייבוא מלא */
export type ReconImportDetailDto = {
  import: ReconImportDto;
  rows: ReconRowDto[];
  kpis: ReconKpis;
};

/** הזמנת WEGO מועמדת לשיוך ידני */
export type ReconCandidateOrderDto = {
  id: string;
  orderNumber: number;
  customerName: string;
  customerCode: string | null;
  weekCode: string | null;
  totalAmount: number;
};
