import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { importTurkeyOrders } from "@/lib/controls/turkey-orders-import";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXT = ["xlsx", "xls", "csv"];

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "קובץ לא תקין" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "הקובץ גדול מדי (מקסימום 15MB)" }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { ok: false, error: "סוג קובץ לא נתמך — xlsx, xls, csv בלבד" },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await importTurkeyOrders(buffer);
    if (summary.totalRows === 0) {
      return NextResponse.json(
        { ok: false, error: "לא נמצאו שורות נתונים בקובץ" },
        { status: 400 },
      );
    }

    await logActivity(
      session.sub,
      `ייבוא הזמנות טורקיה למערכת — נוצרו ${summary.ordersCreated}, עודכנו ${summary.ordersUpdated}`,
    );

    return NextResponse.json({ ok: true, data: summary });
  } catch (e) {
    console.error("[reconciliation seed-orders]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בייבוא" },
      { status: 500 },
    );
  }
}
