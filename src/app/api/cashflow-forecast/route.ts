import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { buildCashflowForecast } from "@/lib/finance/cashflow-forecast/build-forecast";
import { forecastLoadErrorResponse } from "@/lib/finance/cashflow-forecast/api-errors";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const dateFrom = searchParams.get("from")?.trim() || undefined;
    const dateTo = searchParams.get("to")?.trim() || undefined;
    const forecast = await buildCashflowForecast({ dateFrom, dateTo });
    return NextResponse.json({ success: true, ok: true, ...forecast });
  } catch (e) {
    console.error("[cashflow-forecast GET]", e);
    return forecastLoadErrorResponse();
  }
}
