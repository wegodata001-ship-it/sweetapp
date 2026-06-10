import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  changeForecastInflowDate,
  deferForecastOutflow,
  markForecastInflowReceived,
  updateForecastAmount,
} from "@/lib/finance/cashflow-forecast/forecast-actions";
import type { ForecastSourceType } from "@/lib/finance/cashflow-forecast/types";

const OUTFLOW_TYPES: ForecastSourceType[] = [
  "expense_out",
  "supplier_check",
  "employee_pay",
  "investment",
  "external_expense",
];

const INFLOW_TYPES: ForecastSourceType[] = [
  "check_in",
  "customer_receivable",
  "order_receivable",
  "manual_income",
];

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const body = (await req.json()) as {
      action?: string;
      sourceType?: ForecastSourceType;
      sourceId?: string;
      paymentLineId?: string;
      newDueDate?: string;
      newAmount?: number;
      amount?: number;
    };

    const action = body.action?.trim();
    const sourceType = body.sourceType;
    const sourceId = body.sourceId?.trim();

    if (!action || !sourceType || !sourceId) {
      return NextResponse.json({ ok: false, error: "חסרים פרמטרים" }, { status: 400 });
    }

    if (action === "defer") {
      if (!OUTFLOW_TYPES.includes(sourceType) && sourceType !== "check_in") {
        return NextResponse.json({ ok: false, error: "לא ניתן לדחות שורה זו" }, { status: 400 });
      }
      if (!body.newDueDate?.trim()) {
        return NextResponse.json({ ok: false, error: "חסר תאריך" }, { status: 400 });
      }
      await deferForecastOutflow({
        sourceType,
        sourceId,
        paymentLineId: body.paymentLineId,
        newDueDate: body.newDueDate.trim(),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "change_date") {
      if (!INFLOW_TYPES.includes(sourceType)) {
        return NextResponse.json({ ok: false, error: "לא ניתן לשנות תאריך לשורה זו" }, { status: 400 });
      }
      if (sourceType === "manual_income") {
        return NextResponse.json({ ok: false, error: "לא ניתן לערוך רשומה ידנית" }, { status: 400 });
      }
      if (!body.newDueDate?.trim()) {
        return NextResponse.json({ ok: false, error: "חסר תאריך" }, { status: 400 });
      }
      await changeForecastInflowDate({
        sourceType,
        sourceId,
        paymentLineId: body.paymentLineId,
        newDueDate: body.newDueDate.trim(),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "edit_amount") {
      if (!(Number(body.newAmount) > 0)) {
        return NextResponse.json({ ok: false, error: "סכום לא תקין" }, { status: 400 });
      }
      if (sourceType === "manual_income") {
        return NextResponse.json({ ok: false, error: "לא ניתן לערוך רשומה ידנית" }, { status: 400 });
      }
      await updateForecastAmount({
        sourceType,
        sourceId,
        paymentLineId: body.paymentLineId,
        newAmount: Number(body.newAmount),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_received") {
      if (!INFLOW_TYPES.includes(sourceType) || sourceType === "manual_income") {
        return NextResponse.json({ ok: false, error: "לא ניתן לסמן שורה זו" }, { status: 400 });
      }
      const amount = Number(body.amount);
      if (!(amount > 0)) {
        return NextResponse.json({ ok: false, error: "סכום לא תקין" }, { status: 400 });
      }
      await markForecastInflowReceived({
        sourceType,
        sourceId,
        paymentLineId: body.paymentLineId,
        amount,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "פעולה לא מוכרת" }, { status: 400 });
  } catch (e) {
    console.error("[cashflow-forecast action]", e);
    return NextResponse.json(
      {
        success: false,
        ok: false,
        message: e instanceof Error ? e.message : "שגיאה בביצוע הפעולה",
      },
      { status: 400 },
    );
  }
}
