import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { canManageOrderCategory } from "@/lib/future-orders/access";
import { resolveOrderCategory } from "@/lib/future-orders/helpers";
import { normalizePaymentMethodKey } from "@/lib/finance/payment-methods-i18n";
import {
  createCashFlowForOrderPayment,
  isOrderPaymentKind,
  type OrderPaymentKind,
} from "@/lib/finance/order-cashflow-sync";

export const dynamic = "force-dynamic";

function parseDateTime(iso: string | null | undefined): Date {
  if (!iso) return new Date();
  const s = iso.trim();
  // תאריך בלבד (YYYY-MM-DD) — נקבע לשעה ניטרלית
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const order = await prisma.futureOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }
    if (!canManageOrderCategory(session, resolveOrderCategory(order))) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const payments = await prismaAny.orderPayment.findMany({
      where: { orderId: id },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ ok: true, data: payments });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  }
  const { id } = await ctx.params;

  try {
    const order = await prisma.futureOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }
    if (!canManageOrderCategory(session, resolveOrderCategory(order))) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const body = (await req.json()) as {
      amount?: number;
      kind?: string;
      paymentMethod?: string | null;
      paidAt?: string | null;
      notes?: string | null;
    };

    const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
    if (!(amount > 0)) {
      return NextResponse.json({ ok: false, error: "סכום לא תקין" }, { status: 400 });
    }

    const kind: OrderPaymentKind =
      body.kind && isOrderPaymentKind(body.kind) ? body.kind : "PAYMENT";

    const paymentMethod = normalizePaymentMethodKey(body.paymentMethod) ?? body.paymentMethod?.trim() ?? null;
    const paidAt = parseDateTime(body.paidAt);
    const notes = body.notes?.trim() || null;

    const payment = (await prismaAny.orderPayment.create({
      data: {
        orderId: id,
        kind,
        amount,
        paymentMethod,
        paidAt,
        notes,
        status: "ACTIVE",
        createdById: session.sub,
      },
    })) as {
      id: string;
      kind: string;
      amount: number;
      paymentMethod: string | null;
      paidAt: Date;
      notes: string | null;
    };

    await createCashFlowForOrderPayment(payment, {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
    });

    await logActivity(session.sub, "order_payment_create");
    return NextResponse.json({ ok: true, data: payment });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
