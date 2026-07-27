import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { canVoidCountSession } from "@/lib/inventory/count-access";
import {
  COUNT_SESSION_COMPLETED,
  COUNT_SESSION_VOID,
} from "@/lib/inventory/count-session-status";

/**
 * ביטול סבב ספירה שגוי ושחזורו.
 *
 * הביטול הוא סימון סטטוס בלבד: הסשן ושורות הספירה נשארים במסד לצורכי ביקורת,
 * וניתן לשחזר אותם. סשן מבוטל אינו משתתף בדוחות, ב־KPI ובבסיס ההשוואה של
 * הספירה הבאה, כך שההפרשים חוזרים להיות מחושבים מול הספירה התקינה האחרונה.
 *
 * POST   — ביטול הסבב
 * DELETE — שחזור הסבב
 */

type SessionRow = {
  id: string;
  sessionNumber: number;
  locationName: string;
  status: string;
  productCount: number;
  totalCountedQty: number;
};

async function loadSession(id: string): Promise<SessionRow | null> {
  return (await prismaAny.inventoryCountSession.findUnique({
    where: { id },
    select: {
      id: true,
      sessionNumber: true,
      locationName: true,
      status: true,
      productCount: true,
      totalCountedQty: true,
    },
  })) as SessionRow | null;
}

function auditDetail(row: SessionRow, reason?: string | null): string {
  const parts = [
    `sessionId=${row.id}`,
    `sessionNumber=${row.sessionNumber}`,
    `location=${row.locationName || "-"}`,
    `products=${row.productCount}`,
    `totalQty=${row.totalCountedQty}`,
  ];
  if (reason) parts.push(`reason=${reason}`);
  return parts.join(" ");
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  if (!canVoidCountSession(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה לבטל ספירה" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const row = await loadSession(id);
    if (!row) {
      return NextResponse.json({ ok: false, error: "הספירה לא נמצאה" }, { status: 404 });
    }
    if (row.status === COUNT_SESSION_VOID) {
      return NextResponse.json({ ok: true, data: { id: row.id, status: row.status } });
    }

    const body = (await req.json().catch(() => ({}))) as { reason?: string | null };
    const reason = body.reason?.trim() || null;

    await prismaAny.inventoryCountSession.update({
      where: { id },
      data: { status: COUNT_SESSION_VOID },
    });

    await logActivity(session.sub, `inventory_count_session_void ${auditDetail(row, reason)}`);

    return NextResponse.json({
      ok: true,
      data: { id: row.id, sessionNumber: row.sessionNumber, status: COUNT_SESSION_VOID },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  if (!canVoidCountSession(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה לשחזר ספירה" }, { status: 403 });
  }

  try {
    const { id } = await ctx.params;
    const row = await loadSession(id);
    if (!row) {
      return NextResponse.json({ ok: false, error: "הספירה לא נמצאה" }, { status: 404 });
    }
    if (row.status !== COUNT_SESSION_VOID) {
      return NextResponse.json({ ok: true, data: { id: row.id, status: row.status } });
    }

    await prismaAny.inventoryCountSession.update({
      where: { id },
      data: { status: COUNT_SESSION_COMPLETED },
    });

    await logActivity(session.sub, `inventory_count_session_restore ${auditDetail(row)}`);

    return NextResponse.json({
      ok: true,
      data: { id: row.id, sessionNumber: row.sessionNumber, status: COUNT_SESSION_COMPLETED },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
