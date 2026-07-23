import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

/**
 * Legacy — כתיבה בודדת ללא InventoryCountSession.
 * מסלול הכתיבה היחיד הפעיל: POST /api/inventory/monthly-count
 */
export async function POST() {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "count-line הוצא משימוש. יש לשמור דרך POST /api/inventory/monthly-count (סשן ספירה).",
      code: "COUNT_LINE_DEPRECATED",
      useInstead: "/api/inventory/monthly-count",
    },
    { status: 410 },
  );
}
