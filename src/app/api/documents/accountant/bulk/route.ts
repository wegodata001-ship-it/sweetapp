import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

/**
 * סימון/ביטול העברה לרואה חשבון לקבוצת מסמכים.
 * שומר audit log לכל מסמך שעבר שינוי בפועל (no-op מדלגים).
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  let body: { ids?: unknown; sent?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown; sent?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? (body.ids.filter((x) => typeof x === "string" && x.length > 0) as string[])
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "לא נבחרו מסמכים" }, { status: 400 });
  }
  if (typeof body.sent !== "boolean") {
    return NextResponse.json({ ok: false, error: "חסר sent" }, { status: 400 });
  }
  const sent = body.sent;

  try {
    const existing = await prismaAny.financialDocument.findMany({
      where: { id: { in: ids } },
      select: { id: true, sentToCpa: true },
    });
    type ExistRow = { id: string; sentToCpa: boolean };
    const toChange = (existing as ExistRow[]).filter((r) => r.sentToCpa !== sent);
    if (toChange.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }
    const changeIds = toChange.map((r) => r.id);

    await prismaAny.financialDocument.updateMany({
      where: { id: { in: changeIds } },
      data: {
        sentToCpa: sent,
        sentToCpaAt: sent ? new Date() : null,
        sentToCpaById: sent ? session.sub : null,
      },
    });

    await prismaAny.accountantTransferLog.createMany({
      data: changeIds.map((id) => ({
        documentId: id,
        action: sent ? "marked_sent" : "marked_not_sent",
        performedById: session.sub,
      })),
    });

    await logActivity(
      session.sub,
      sent ? "document_accountant_bulk_marked_sent" : "document_accountant_bulk_marked_not_sent",
    );

    return NextResponse.json({ ok: true, updated: changeIds.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
