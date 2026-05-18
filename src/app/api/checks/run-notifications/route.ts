import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { runDailyCheckNotifications } from "@/lib/checks/notify";

/**
 * הפעלה ידנית של סבב התראות יומי. בעתיד — לחבר ל־cron (Vercel/Supabase).
 */
export async function POST() {
  const block = await requireDb();
  if (block) return block;
  try {
    const result = await runDailyCheckNotifications();
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export const GET = POST;
