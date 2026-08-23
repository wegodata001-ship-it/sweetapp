import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  isValidCopyYmd,
  listSessionsForCopy,
} from "@/lib/inventory/count-copy-service";

/**
 * GET — ספירות היסטוריות להעתקה לפי טווח תאריכים.
 * Read Only: לא משנה מלאי / ספירות / תנועות.
 *
 * Query: from=YYYY-MM-DD&to=YYYY-MM-DD&locationId?=
 */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const from = searchParams.get("from")?.trim() || "";
    const to = searchParams.get("to")?.trim() || "";
    const locationId = searchParams.get("locationId")?.trim() || null;

    if (!isValidCopyYmd(from) || !isValidCopyYmd(to)) {
      return NextResponse.json(
        { ok: false, error: "תאריכים לא תקינים (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
    if (from > to) {
      return NextResponse.json(
        { ok: false, error: "מתאריך לא יכול להיות אחרי עד תאריך" },
        { status: 400 },
      );
    }

    const data = await listSessionsForCopy({ from, to, locationId });
    return NextResponse.json({
      ok: true,
      data: {
        from,
        to,
        locationId,
        sessionCount: data.length,
        sessions: data,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    if (msg === "INVALID_DATE_RANGE" || msg === "FROM_AFTER_TO") {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
