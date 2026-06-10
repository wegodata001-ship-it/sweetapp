import type { ForecastSourceType } from "@/lib/finance/cashflow-forecast/types";
import { ORDER_CATEGORY_WEDDING } from "@/lib/future-orders/helpers";

export function resolveForecastSourceHref(params: {
  sourceType?: ForecastSourceType;
  sourceId?: string;
  orderCategory?: string | null;
}): string | null {
  const { sourceType, sourceId, orderCategory } = params;
  if (!sourceType || !sourceId || sourceType === "opening") return null;

  if (sourceType === "check_in") {
    return `/finance/checks`;
  }

  if (sourceType === "order_receivable") {
    if (orderCategory === ORDER_CATEGORY_WEDDING) {
      return `/admin/wedding-orders`;
    }
    return `/admin/daily-orders`;
  }

  if (
    sourceType === "customer_receivable" ||
    sourceType === "expense_out" ||
    sourceType === "supplier_check" ||
    sourceType === "employee_pay" ||
    sourceType === "investment" ||
    sourceType === "external_expense" ||
    sourceType === "manual_income"
  ) {
    if (sourceType === "manual_income") return null;
    return `/finance/register?edit=${encodeURIComponent(sourceId)}`;
  }

  return null;
}
