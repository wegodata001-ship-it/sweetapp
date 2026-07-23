import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listCountSessions } from "@/lib/inventory/count-session-service";

/** GET — היסטוריית ספירות (סשנים) למיקום */
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
    const location = searchParams.get("location")?.trim() || null;
    const take = parseInt(searchParams.get("take") || "50", 10);
    if (!locationId && !location) {
      return NextResponse.json(
        { ok: false, error: "נדרש locationId או location" },
        { status: 400 },
      );
    }
    const data = await listCountSessions({ locationId, locationName: location, take });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
