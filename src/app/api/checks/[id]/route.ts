import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { serializeCheck } from "@/lib/checks/serialize";
import { isCheckStatus } from "@/lib/checks/helpers";

const CHECK_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  document: { select: { id: true, title: true } },
} as const;

type CheckRow = Parameters<typeof serializeCheck>[0];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  const row = (await prismaAny.checkPayment.findUnique({
    where: { id },
    include: CHECK_INCLUDE,
  })) as CheckRow | null;
  if (!row) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  return NextResponse.json({ ok: true, data: serializeCheck(row) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;

  try {
    const body = (await req.json()) as {
      checkNumber?: string;
      bankName?: string;
      branch?: string | null;
      amount?: number;
      dueDate?: string;
      status?: string;
      notes?: string | null;
    };

    const data: Record<string, unknown> = {};
    if (body.checkNumber !== undefined) {
      const v = body.checkNumber.trim();
      if (!v) return NextResponse.json({ ok: false, error: "מספר צ'ק חובה" }, { status: 400 });
      data.checkNumber = v;
    }
    if (body.bankName !== undefined) {
      const v = body.bankName.trim();
      if (!v) return NextResponse.json({ ok: false, error: "בנק חובה" }, { status: 400 });
      data.bankName = v;
    }
    if (body.branch !== undefined) data.branch = body.branch?.trim() || null;
    if (body.amount !== undefined) {
      const n = Number(body.amount);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ ok: false, error: "סכום לא תקין" }, { status: 400 });
      }
      data.amount = n;
    }
    if (body.dueDate !== undefined) {
      const d = new Date(body.dueDate);
      if (!Number.isFinite(d.getTime())) {
        return NextResponse.json({ ok: false, error: "תאריך פירעון לא תקין" }, { status: 400 });
      }
      data.dueDate = d;
    }
    if (body.status !== undefined) {
      if (!isCheckStatus(body.status)) {
        return NextResponse.json({ ok: false, error: "סטטוס לא חוקי" }, { status: 400 });
      }
      data.status = body.status;
    }
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
    }

    const updated = (await prismaAny.checkPayment.update({
      where: { id },
      data,
      include: CHECK_INCLUDE,
    })) as CheckRow;
    return NextResponse.json({ ok: true, data: serializeCheck(updated) });
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
  const { id } = await ctx.params;
  try {
    const existing = (await prismaAny.checkPayment.findUnique({ where: { id } })) as {
      status: string;
    } | null;
    if (!existing) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }
    if (existing.status === "CLEARED" || existing.status === "DEPOSITED") {
      return NextResponse.json(
        { ok: false, error: "לא ניתן למחוק צ'ק שנפרע / הופקד. בטלו אותו במקום זה." },
        { status: 400 },
      );
    }
    await prismaAny.checkPayment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
