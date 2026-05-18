import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { prismaDocToFinanceRow } from "@/lib/finance/map-document";

export const dynamic = "force-dynamic";

/**
 * סימון / ביטול העברה לרואה חשבון.
 * שומר sentToCpa, sentToCpaAt, sentToCpaById ויוצר רשומת AccountantTransferLog.
 * מחזיר את המסמך המעודכן לעדכון מיידי ב־UI ללא refresh מלא.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: { sent?: boolean };
  try {
    body = (await req.json()) as { sent?: boolean };
  } catch {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }
  if (typeof body.sent !== "boolean") {
    return NextResponse.json({ ok: false, error: "חסר sent" }, { status: 400 });
  }

  try {
    const existing = await prismaAny.financialDocument.findUnique({
      where: { id },
      select: { id: true, sentToCpa: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "המסמך לא נמצא" }, { status: 404 });
    }

    const noop = existing.sentToCpa === body.sent;

    if (!noop) {
      await prismaAny.financialDocument.update({
        where: { id },
        data: {
          sentToCpa: body.sent,
          sentToCpaAt: body.sent ? new Date() : null,
          sentToCpaById: body.sent ? session.sub : null,
        },
      });

      await prismaAny.accountantTransferLog.create({
        data: {
          documentId: id,
          action: body.sent ? "marked_sent" : "marked_not_sent",
          performedById: session.sub,
        },
      });
      await logActivity(session.sub, body.sent ? "document_accountant_marked_sent" : "document_accountant_marked_not_sent");
    }

    const updated = await prismaAny.financialDocument.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
        sentToCpaBy: { select: { id: true, fullName: true } },
      },
    });

    return NextResponse.json({ ok: true, data: updated ? prismaDocToFinanceRow(updated) : null });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
