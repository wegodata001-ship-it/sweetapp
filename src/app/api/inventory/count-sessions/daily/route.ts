import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canViewCountHistory } from "@/lib/inventory/count-access";
import { listDailyCountCoverage } from "@/lib/inventory/count-session-service";
import { resolveQuickRange, type QuickRangeKey } from "@/lib/inventory/count-history-audit";

/** GET — תצוגה יומית של ספירות שנשמרו — READ ONLY */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const locationId = searchParams.get("locationId")?.trim() || null;
    const allLocations = searchParams.get("allLocations") === "1";
    const rangeKey = (searchParams.get("range")?.trim() || "7d") as QuickRangeKey;
    const dateFromParam = searchParams.get("dateFrom")?.trim() || null;
    const dateToParam = searchParams.get("dateTo")?.trim() || null;

    if (allLocations && !canViewCountHistory(session.role)) {
      return NextResponse.json(
        { ok: false, error: "אין הרשאה לצפייה בכל המיקומים" },
        { status: 403 },
      );
    }
    if (!locationId && !allLocations) {
      return NextResponse.json(
        { ok: false, error: "נדרש locationId או allLocations=1" },
        { status: 400 },
      );
    }

    const { dateFrom, dateTo } = resolveQuickRange(
      rangeKey === "custom" || dateFromParam || dateToParam ? "custom" : rangeKey,
      dateFromParam,
      dateToParam,
    );

    const data = await listDailyCountCoverage({
      dateFrom,
      dateTo,
      locationId,
      allLocations,
    });

    return NextResponse.json({ ok: true, data, meta: { dateFrom, dateTo } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
