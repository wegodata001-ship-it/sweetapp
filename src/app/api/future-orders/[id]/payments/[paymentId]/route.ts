import { NextRequest, NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { canManageOrderCategory } from "@/lib/future-orders/access";
import { resolveOrderCategory } from "@/lib/future-orders/helpers";
import { reverseCashFlowForOrderPayment } from "@/lib/finance/order-cashflow-sync";

export const dynamic = "force-dynamic";

/** ביטול תשלום הזמנה — ביטול לוגי + תנועת תזרים נגדית (לא מוחק היסטוריה). */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; paymentId: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  }
  const { id, paymentId } = await ctx.params;

  try {
    const order = await prisma.futureOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }
    if (!canManageOrderCategory(session, resolveOrderCategory(order))) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const payment = (await prismaAny.orderPayment.findUnique({
      where: { id: paymentId },
    })) as {
      id: string;
      orderId: string;
      kind: string;
      amount: number;
      paymentMethod: string | null;
      paidAt: Date;
      notes: string | null;
      status: string;
    } | null;

    if (!payment || payment.orderId !== id) {
      return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });
    }
    if (payment.status === "CANCELLED") {
      return NextResponse.json({ ok: false, error: "התשלום כבר בוטל" }, { status: 409 });
    }

    const cancelledAt = new Date();
    const updated = await prismaAny.orderPayment.update({
      where: { id: paymentId },
      data: { status: "CANCELLED", cancelledAt, cancelledById: session.sub },
    });

    await reverseCashFlowForOrderPayment(payment, {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
    }, cancelledAt);

    await logActivity(session.sub, "order_payment_cancel");
    return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
