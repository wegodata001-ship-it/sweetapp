import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import {
  computeRemainingAmount,
  isValidEventType,
  isValidStatus,
} from "@/lib/future-orders/helpers";

export const dynamic = "force-dynamic";

function parseDateOnly(iso: string): Date | null {
  const s = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  const { id } = await ctx.params;

  try {
    const existing = await prisma.futureOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }

    const body = (await req.json()) as {
      customerName?: string;
      phone?: string | null;
      eventType?: string;
      eventDate?: string;
      eventTime?: string | null;
      itemsDescription?: string | null;
      totalAmount?: number;
      depositAmount?: number;
      depositPaid?: boolean;
      status?: string;
      isCompleted?: boolean;
      notes?: string | null;
      /** כשמסיימים הזמנה מהממשק */
      complete?: boolean;
    };

    const nextTotal =
      body.totalAmount !== undefined ? Math.max(0, Number(body.totalAmount) || 0) : existing.totalAmount;
    const nextDeposit =
      body.depositAmount !== undefined ? Math.max(0, Number(body.depositAmount) || 0) : existing.depositAmount;

    if (nextDeposit > nextTotal + 1e-9) {
      return NextResponse.json({ ok: false, error: "הפיקדון לא יכול לעלות על סכום ההזמנה" }, { status: 400 });
    }

    let eventDate = existing.eventDate;
    if (body.eventDate !== undefined) {
      const parsed = parseDateOnly(body.eventDate);
      if (!parsed) {
        return NextResponse.json({ ok: false, error: "תאריך אירוע לא תקין" }, { status: 400 });
      }
      eventDate = parsed;
    }

    let status: string = existing.status;
    let isCompleted = existing.isCompleted;
    let completedAt: Date | null = existing.completedAt;

    if (body.complete) {
      isCompleted = true;
      completedAt = new Date();
      status = "COMPLETED";
    } else {
      if (body.status !== undefined) {
        if (!isValidStatus(body.status)) {
          return NextResponse.json({ ok: false, error: "סטטוס לא תקין" }, { status: 400 });
        }
        status = body.status;
      }
      if (body.isCompleted !== undefined) {
        isCompleted = Boolean(body.isCompleted);
      }
      if (isCompleted && !completedAt) {
        completedAt = new Date();
      }
      if (!isCompleted) {
        completedAt = null;
      }
    }

    if (body.eventType !== undefined && !isValidEventType(body.eventType)) {
      return NextResponse.json({ ok: false, error: "סוג אירוע לא תקין" }, { status: 400 });
    }

    const remainingAmount = computeRemainingAmount(nextTotal, nextDeposit);

    const row = await prisma.futureOrder.update({
      where: { id },
      data: {
        ...(body.customerName !== undefined ? { customerName: body.customerName.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.eventType !== undefined ? { eventType: body.eventType } : {}),
        eventDate,
        ...(body.eventTime !== undefined ? { eventTime: body.eventTime?.trim() || null } : {}),
        ...(body.itemsDescription !== undefined ? { itemsDescription: body.itemsDescription?.trim() || null } : {}),
        totalAmount: nextTotal,
        depositAmount: nextDeposit,
        remainingAmount,
        ...(body.depositPaid !== undefined ? { depositPaid: Boolean(body.depositPaid) } : {}),
        status,
        isCompleted,
        completedAt,
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      },
    });

    if (session) await logActivity(session.sub, "future_order_edit");
    return NextResponse.json({ ok: true, data: row });
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
  const { id } = await ctx.params;
  try {
    const existing = await prisma.futureOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }
    await prisma.futureOrder.delete({ where: { id } });
    if (session) await logActivity(session.sub, "future_order_delete");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
