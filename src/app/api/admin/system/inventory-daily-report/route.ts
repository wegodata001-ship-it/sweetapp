import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { logActivity } from "@/lib/activity-log";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { runInventoryDailyReportJob } from "@/lib/inventory/daily-count-report-job";
import { prismaAny } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return {
      session: null,
      block: NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 }),
    };
  }
  return { session, block: null };
}

/** ריצות אחרונות — לתצוגת מצב במסך ההגדרות */
export async function GET() {
  const dbBlock = await requireDb();
  if (dbBlock) return dbBlock;
  const { block } = await requireManager();
  if (block) return block;

  const runs = (await prismaAny.inventoryDailyReportRun.findMany({
    orderBy: { reportDay: "desc" },
    take: 7,
    select: {
      reportDay: true,
      status: true,
      sessionCount: true,
      recipientCount: true,
      sentCount: true,
      failedCount: true,
      attempts: true,
      error: true,
      finishedAt: true,
    },
  })) as unknown[];

  return NextResponse.json({ ok: true, data: runs });
}

/** שליחה יזומה של דוח היום (או של יום מסוים) — לבדיקה ולשליחה חוזרת */
export async function POST(req: NextRequest) {
  const dbBlock = await requireDb();
  if (dbBlock) return dbBlock;
  const { session, block } = await requireManager();
  if (block || !session) return block;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      day?: string | null;
      force?: boolean;
      language?: string | null;
    };

    const result = await runInventoryDailyReportJob({
      day: body.day ?? null,
      force: body.force !== false,
      language: body.language ?? null,
    });

    await logActivity(
      session.sub,
      `הפיק דוח ספירות יומי ידנית ליום ${result.day} (${result.status}, נשלחו ${result.sent})`,
    );

    return NextResponse.json({ ok: result.ok, data: result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
