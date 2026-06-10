import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { deferForecastPayment } from "@/lib/finance/cashflow-forecast/defer-payment";
import type { ForecastSourceType } from "@/lib/finance/cashflow-forecast/types";

const VALID_SOURCE_TYPES = new Set<ForecastSourceType>([
  "opening",
  "check_in",
  "customer_receivable",
  "order_receivable",
  "expense_out",
  "supplier_check",
  "employee_pay",
  "investment",
  "external_expense",
  "manual_income",
]);

function parseSourceType(value: string | undefined): ForecastSourceType {
  if (value && VALID_SOURCE_TYPES.has(value as ForecastSourceType)) {
    return value as ForecastSourceType;
  }
  return "supplier_check";
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as {
      sourceType?: string;
      sourceId?: string;
      paymentLineId?: string;
      newDueDate?: string;
    };
    if (!body.sourceId?.trim() || !body.newDueDate?.trim()) {
      return NextResponse.json({ ok: false, error: "חסרים פרמטרים" }, { status: 400 });
    }
    await deferForecastPayment({
      sourceType: parseSourceType(body.sourceType),
      sourceId: body.sourceId.trim(),
      paymentLineId: body.paymentLineId?.trim(),
      newDueDate: body.newDueDate.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[cashflow-forecast defer]", e);
    return NextResponse.json(
      { success: false, ok: false, message: "שגיאה בעדכון תאריך הפירעון" },
      { status: 400 },
    );
  }
}
