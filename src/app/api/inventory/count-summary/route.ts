import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canViewCountSummary } from "@/lib/inventory/count-access";
import { loadInventoryReportRange } from "@/lib/inventory/daily-count-report";
import { resolveSummaryRange } from "@/lib/inventory/count-summary-range";

/**
 * GET — סיכום ספירות לטווח תאריכים (היום / השבוע / החודש / טווח מותאם).
 * קריאה בלבד: אינה נוגעת בסבבי הספירה ואינה כותבת דבר.
 */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  if (!canViewCountSummary(session.role)) {
    return NextResponse.json(
      { ok: false, error: "רק מנהל מערכת או בעל העסק יכולים לצפות בסיכומי ספירות" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = req.nextUrl;
    const range = resolveSummaryRange({
      preset: searchParams.get("preset"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    const report = await loadInventoryReportRange(range.from, range.to);

    // שורות המוצרים אינן מוצגות במסך הסיכומים והן הכבדות ביותר — הן נשלחות
    // רק לקבצים המצורפים, כדי שהמודל ייטען מהר גם במאות ספירות
    const { lines, ...rest } = report;
    return NextResponse.json({
      ok: true,
      data: { ...rest, lineCount: lines.length },
      meta: { preset: range.preset, clamped: range.clamped, canSendEmail: true },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
