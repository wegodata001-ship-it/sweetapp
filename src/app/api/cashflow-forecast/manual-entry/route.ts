import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { addManualForecastEntry } from "@/lib/finance/cashflow-forecast/forecast-manual-entries";
import { syncCashflowShortageNotifications } from "@/lib/notifications/checkCashflowShortage";

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  try {
    const body = (await req.json()) as {
      entryType?: "expected_income" | "loan";
      amount?: number;
      dueDate?: string;
      description?: string;
    };

    if (body.entryType !== "expected_income" && body.entryType !== "loan") {
      return NextResponse.json({ ok: false, error: "סוג רשומה לא תקין" }, { status: 400 });
    }

    const entry = await addManualForecastEntry({
      entryType: body.entryType,
      amount: Number(body.amount),
      dueDate: body.dueDate?.trim() ?? "",
      description: body.description,
    });

    await syncCashflowShortageNotifications();
    return NextResponse.json({ ok: true, data: entry });
  } catch (e) {
    console.error("[cashflow-forecast manual-entry]", e);
    return NextResponse.json(
      {
        success: false,
        ok: false,
        message: e instanceof Error ? e.message : "שגיאה בהוספת רשומה",
      },
      { status: 400 },
    );
  }
}
