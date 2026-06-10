import { deferForecastOutflow } from "@/lib/finance/cashflow-forecast/forecast-actions";
import type { ForecastSourceType } from "@/lib/finance/cashflow-forecast/types";

/** דחיית תשלום יציאה עתידית — מעדכן תאריך פירעון ומחשב מחדש התראות */
export async function deferForecastPayment(params: {
  sourceType: ForecastSourceType;
  sourceId: string;
  paymentLineId?: string;
  newDueDate: string;
}): Promise<void> {
  await deferForecastOutflow(params);
}
