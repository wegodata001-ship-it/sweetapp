import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import {
  canManageOrderCategory,
  canViewWeddingOrders,
} from "@/lib/future-orders/access";
import {
  backfillOrderCategoriesOnce,
  computeRemainingAmount,
  eventTypeForCategory,
  isValidOrderCategory,
  isValidStatus,
  ORDER_CATEGORY_DAILY,
  ORDER_CATEGORY_WEDDING,
  prismaCategoryFilter,
  type OrderCategory,
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

function parseCategory(sp: URLSearchParams, body?: { orderCategory?: string }): OrderCategory | null {
  const raw = (body?.orderCategory ?? sp.get("category") ?? "").trim();
  if (raw === ORDER_CATEGORY_DAILY || raw === ORDER_CATEGORY_WEDDING) return raw;
  if (raw === "daily") return ORDER_CATEGORY_DAILY;
  if (raw === "wedding") return ORDER_CATEGORY_WEDDING;
  return null;
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const category = parseCategory(sp);
    if (!category || !isValidOrderCategory(category)) {
      return NextResponse.json({ ok: false, error: "חסרה קטגוריית הזמנה" }, { status: 400 });
    }
    if (category === ORDER_CATEGORY_WEDDING && !canViewWeddingOrders(session)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const status = sp.get("status")?.trim();
    const q = sp.get("q")?.trim();
    const from = sp.get("from")?.trim();
    const to = sp.get("to")?.trim();

    const and: Record<string, unknown>[] = [prismaCategoryFilter(category)];
    if (status && isValidStatus(status)) {
      and.push({ status });
    }
    if (q) {
      and.push({
        OR: [
          { customerName: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
          { itemsDescription: { contains: q, mode: "insensitive" as const } },
        ],
      });
    }
    const fromDate = from ? parseDateOnly(from) : null;
    const toDate = to ? parseDateOnly(to) : null;
    if (fromDate || toDate) {
      const eventDate: Record<string, Date> = {};
      if (fromDate) eventDate.gte = fromDate;
      if (toDate) eventDate.lte = toDate;
      and.push({ eventDate });
    }
    const where = and.length === 1 ? and[0] : { AND: and };

    await backfillOrderCategoriesOnce(prisma);

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
  if (!session) {
    return NextResponse.json({ ok: false, error: "לא מחובר" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      orderCategory?: string;
      customerName?: string;
      phone?: string | null;
      eventDate?: string;
      eventTime?: string | null;
      address?: string | null;
      guestCount?: number | null;
      itemsDescription?: string | null;
      totalAmount?: number;
      depositAmount?: number;
      depositPaid?: boolean;
      status?: string;
      notes?: string | null;
    };

    const category = parseCategory(new URLSearchParams(), body) ?? ORDER_CATEGORY_DAILY;
    if (!isValidOrderCategory(category)) {
      return NextResponse.json({ ok: false, error: "קטגוריה לא תקינה" }, { status: 400 });
    }
    if (!canManageOrderCategory(session, category)) {
      return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
    }

    const name = body.customerName?.trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "חסר שם לקוח" }, { status: 400 });
    }
    const eventDate = body.eventDate ? parseDateOnly(body.eventDate) : null;
    if (!eventDate) {
      return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
    }

    const totalAmount = Math.max(0, Number(body.totalAmount) || 0);
    const depositAmount = Math.max(0, Number(body.depositAmount) ?? 0);
    if (depositAmount > totalAmount + 1e-9) {
      return NextResponse.json({ ok: false, error: "הפיקדון לא יכול לעלות על סכום ההזמנה" }, { status: 400 });
    }

    const remainingAmount = computeRemainingAmount(totalAmount, depositAmount);
    const status = body.status && isValidStatus(body.status) ? body.status : "PENDING";
    const orderNumber = await nextOrderNumber();
    const guestCount =
      body.guestCount != null && Number.isFinite(Number(body.guestCount))
        ? Math.max(0, Math.floor(Number(body.guestCount)))
        : null;

    const row = await prisma.futureOrder.create({
      data: {
        orderNumber,
        orderCategory: category,
        customerName: name,
        phone: body.phone?.trim() || null,
        eventType: eventTypeForCategory(category),
        eventDate,
        eventTime: body.eventTime?.trim() || null,
        address: body.address?.trim() || null,
        guestCount,
        itemsDescription: body.itemsDescription?.trim() || null,
        totalAmount,
        depositAmount,
        remainingAmount,
        depositPaid: Boolean(body.depositPaid),
        status,
        notes: body.notes?.trim() || null,
      },
    });

    await logActivity(session.sub, "future_order_create");
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

