import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { RECON_AMOUNT_EPSILON, RECON_STATUS } from "@/lib/controls/reconciliation-constants";
import { loadImportDetail } from "@/lib/controls/reconciliation-load";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ rowId: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  const { rowId } = await ctx.params;
  try {
    const body = (await req.json()) as { orderId?: string };
    const orderId = String(body.orderId || "").trim();
    if (!orderId) {
      return NextResponse.json({ ok: false, error: "חסר מזהה הזמנה" }, { status: 400 });
    }

    const row = await prisma.systemReconciliationRow.findUnique({ where: { id: rowId } });
    if (!row) {
      return NextResponse.json({ ok: false, error: "שורה לא נמצאה" }, { status: 404 });
    }
    const order = await prisma.futureOrder.findUnique({
      where: { id: orderId },
      select: { id: true, totalAmount: true },
    });
    if (!order) {
      return NextResponse.json({ ok: false, error: "הזמנה לא נמצאה" }, { status: 404 });
    }

    // שלב ראשון: לא משנים את ההזמנה — רק שומרים את ההתאמה בשורת הביניים
    const ext = row.externalAmount ?? 0;
    const wego = order.totalAmount ?? 0;
    const diff = Math.round((ext - wego) * 100) / 100;
    const status =
      Math.abs(diff) <= RECON_AMOUNT_EPSILON ? RECON_STATUS.MATCHED : RECON_STATUS.AMOUNT_DIFFERENCE;

    await prisma.systemReconciliationRow.update({
      where: { id: rowId },
      data: { matchedOrderId: order.id, status, differenceAmount: diff },
    });

    await logActivity(session.sub, `שיוך ידני התאמת מערכות — שורה ${rowId}`);

    const detail = await loadImportDetail(row.importId);
    return NextResponse.json({ ok: true, data: detail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בשיוך" },
      { status: 500 },
    );
  }
}
