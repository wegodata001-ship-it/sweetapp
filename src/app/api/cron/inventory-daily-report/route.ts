import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { authorizeCron, isVerifiedCronRequest } from "@/lib/cron/authorize";
import { runInventoryDailyReportJob } from "@/lib/inventory/daily-count-report-job";
import { reportSystemFailureAsync } from "@/lib/notifications/system-alert-dispatch";

export const dynamic = "force-dynamic";

/**
 * /api/cron/inventory-daily-report
 *
 * דוח סיכום ספירות המלאי של יום העבודה. מיועד להרצה על ידי מתזמן חיצוני
 * (Vercel Cron / cron של השרת) בסוף כל יום עבודה. ראו vercel.json.
 *
 * הדוח נשלח רק אם בוצעה לפחות ספירה אחת באותו יום, ורק פעם אחת ליום:
 * הרצה חוזרת של אותו יום לא תשלח שוב, אבל תנסה מחדש ריצה שנכשלה.
 *
 * פרמטרים:
 *   day=YYYY-MM-DD   יום מסוים (ברירת מחדל: היום)
 *   offsetDays=1     סיכום היום שקדם — כשהמתזמן רץ אחרי חצות
 *   force=1          שליחה חוזרת גם אם הדוח כבר נשלח — דורש CRON_SECRET מאומת
 *   lang=he|ar|en    שפת המסמך המצורף
 */
async function handle(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const block = await requireDb();
  if (block) return block;

  const params = req.nextUrl.searchParams;
  const offsetRaw = Number(params.get("offsetDays"));
  // force עוקף את הגנת הכפילות, ולכן מותר רק לקריאה שהוכיחה שהיא מהמתזמן.
  // שליחה חוזרת יזומה נעשית ממסך ההגדרות, שם יש אימות משתמש.
  const forceRequested = params.get("force") === "1" || params.get("force") === "true";
  const force = forceRequested && isVerifiedCronRequest(req);

  try {
    const result = await runInventoryDailyReportJob({
      day: params.get("day"),
      offsetDays: Number.isFinite(offsetRaw) ? offsetRaw : 0,
      force,
      language: params.get("lang"),
    });
    return NextResponse.json({
      ...result,
      ranAt: new Date().toISOString(),
      ...(forceRequested && !force ? { forceIgnored: true } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "internal error";
    reportSystemFailureAsync({
      category: "cronFailure",
      title: "cron דוח ספירות יומי נכשל",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
