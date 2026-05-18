import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { serializeCheck } from "@/lib/checks/serialize";
import { sendCheckAlert } from "@/lib/checks/notify";

const CHECK_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  document: { select: { id: true, title: true } },
} as const;

type CheckRow = Parameters<typeof serializeCheck>[0];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  const { id } = await ctx.params;

  try {
    const body = (await req.json().catch(() => ({}))) as { bounceReason?: string };
    const bounceReason = body.bounceReason?.trim();
    if (!bounceReason) {
      return NextResponse.json(
        { ok: false, error: "חובה לציין סיבת חזרה", requires_reason: true },
        { status: 422 },
      );
    }

    const existing = (await prismaAny.checkPayment.findUnique({
      where: { id },
    })) as { status: string } | null;
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    if (existing.status === "CLEARED" || existing.status === "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: "לא ניתן לסמן צ'ק שכבר נפרע/בוטל כחוזר" },
        { status: 400 },
      );
    }

    const updated = (await prismaAny.checkPayment.update({
      where: { id },
      data: {
        status: "BOUNCED",
        bounceReason,
        bouncedAt: new Date(),
      },
      include: CHECK_INCLUDE,
    })) as CheckRow;

    if (session) await logActivity(session.sub, "check_bounce");

    await sendCheckAlert({
      kind: "bounced",
      check: {
        id: updated.id,
        customerId: updated.customerId,
        customer: updated.customer ?? null,
        checkNumber: updated.checkNumber,
        amount: updated.amount,
        dueDate: updated.dueDate,
        status: updated.status,
      },
      force: true,
    });

    return NextResponse.json({ ok: true, data: serializeCheck(updated) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
