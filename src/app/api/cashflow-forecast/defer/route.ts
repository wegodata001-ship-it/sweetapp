import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { deferForecastPayment } from "@/lib/finance/cashflow-forecast/defer-payment";

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
      sourceType: body.sourceType ?? "supplier_check",
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
