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

async function nextOrderNumber(): Promise<number> {
  const agg = await prisma.futureOrder.aggregate({ _max: { orderNumber: true } });
  const max = agg._max.orderNumber ?? 0;
  return max + 1;
}

function parseDateOnly(iso: string): Date | null {
  const s = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status")?.trim();
    const q = sp.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (status && isValidStatus(status)) {
      where.status = status;
    }
    if (q) {
      where.OR = [
        { customerName: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
        { itemsDescription: { contains: q, mode: "insensitive" as const } },
      ];
    }

    const rows = await prisma.futureOrder.findMany({
      where,
      orderBy: [{ eventDate: "asc" }, { orderNumber: "desc" }],
    });
    return NextResponse.json({ ok: true, data: rows });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  try {
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
      notes?: string | null;
    };

    const name = body.customerName?.trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "חסר שם לקוח" }, { status: 400 });
    }
    if (!body.eventType || !isValidEventType(body.eventType)) {
      return NextResponse.json({ ok: false, error: "סוג אירוע לא תקין" }, { status: 400 });
    }
    const eventDate = body.eventDate ? parseDateOnly(body.eventDate) : null;
    if (!eventDate) {
      return NextResponse.json({ ok: false, error: "תאריך אירוע לא תקין" }, { status: 400 });
    }

    const totalAmount = Math.max(0, Number(body.totalAmount) || 0);
    const depositAmount = Math.max(0, Number(body.depositAmount) ?? 0);
    if (depositAmount > totalAmount + 1e-9) {
      return NextResponse.json({ ok: false, error: "הפיקדון לא יכול לעלות על סכום ההזמנה" }, { status: 400 });
    }

    const remainingAmount = computeRemainingAmount(totalAmount, depositAmount);
    const status = body.status && isValidStatus(body.status) ? body.status : "PENDING";

    const orderNumber = await nextOrderNumber();

    const row = await prisma.futureOrder.create({
      data: {
        orderNumber,
        customerName: name,
        phone: body.phone?.trim() || null,
        eventType: body.eventType,
        eventDate,
        eventTime: body.eventTime?.trim() || null,
        itemsDescription: body.itemsDescription?.trim() || null,
        totalAmount,
        depositAmount,
        remainingAmount,
        depositPaid: Boolean(body.depositPaid),
        status,
        notes: body.notes?.trim() || null,
      },
    });

    if (session) await logActivity(session.sub, "future_order_create");
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
