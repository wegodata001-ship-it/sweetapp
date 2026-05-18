import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { serializeCheck } from "@/lib/checks/serialize";

const CHECK_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  document: { select: { id: true, title: true } },
} as const;

type CheckRow = Parameters<typeof serializeCheck>[0];

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  const { id } = await ctx.params;

  try {
    const existing = (await prismaAny.checkPayment.findUnique({
      where: { id },
    })) as { status: string } | null;
    if (!existing) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    if (existing.status !== "PENDING" && existing.status !== "DEPOSITED") {
      return NextResponse.json(
        { ok: false, error: "ניתן לסמן כנפרע רק צ'ק ממתין/הופקד" },
        { status: 400 },
      );
    }
    const now = new Date();
    const updated = (await prismaAny.checkPayment.update({
      where: { id },
      data: {
        status: "CLEARED",
        clearedAt: now,
        depositedAt: existing.status === "DEPOSITED" ? undefined : now,
      },
      include: CHECK_INCLUDE,
    })) as CheckRow;

    if (session) await logActivity(session.sub, "check_clear");

    return NextResponse.json({ ok: true, data: serializeCheck(updated) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
