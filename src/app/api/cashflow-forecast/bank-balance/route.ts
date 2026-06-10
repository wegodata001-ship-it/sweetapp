import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import {
  getForecastBankBalance,
  setForecastBankBalance,
} from "@/lib/finance/cashflow-forecast/bank-balance-db";
import {
  forecastLoadErrorResponse,
  forecastSaveErrorResponse,
  isForecastMigrationError,
} from "@/lib/finance/cashflow-forecast/api-errors";
import { syncCashflowShortageNotifications } from "@/lib/notifications/checkCashflowShortage";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const forecastBankBalance = await getForecastBankBalance();
    return NextResponse.json({ success: true, ok: true, forecastBankBalance });
  } catch (e) {
    console.error("[cashflow-forecast bank-balance GET]", e);
    return forecastLoadErrorResponse();
  }
}

export async function PATCH(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as { forecastBankBalance: number };
    if (typeof body.forecastBankBalance !== "number" || Number.isNaN(body.forecastBankBalance)) {
      return NextResponse.json(
        { success: false, ok: false, message: "סכום לא תקין" },
        { status: 400 },
      );
    }
    const forecastBankBalance = await setForecastBankBalance(body.forecastBankBalance);
    try {
      await syncCashflowShortageNotifications();
    } catch (e) {
      console.error("[cashflow-forecast] sync notifications", e);
    }
    return NextResponse.json({ success: true, ok: true, forecastBankBalance });
  } catch (e) {
    console.error("[cashflow-forecast bank-balance PATCH]", e);
    if (isForecastMigrationError(e)) {
      return forecastSaveErrorResponse("נדרש עדכון מסד נתונים — הרץ prisma db push");
    }
    return forecastSaveErrorResponse();
  }
}
