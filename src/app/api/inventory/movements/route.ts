import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { inventoryMovementDelta, isValidMovementType } from "@/lib/inventory/movement";

function dayBounds(isoDate: string | null): { start: Date; end: Date } | null {
  if (!isoDate?.trim()) return null;
  const d = new Date(isoDate.trim());
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const dateParam = searchParams.get("date");
    const bounds = dayBounds(dateParam);
    const start = bounds?.start ?? (() => {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      return s;
    })();
    const end = bounds?.end ?? (() => {
      const e = new Date();
      e.setHours(23, 59, 59, 999);
      return e;
    })();

    const rows = await prisma.inventoryMovement.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: {
        product: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
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
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      productId: string;
      type: string;
      quantity: number;
      notes?: string | null;
      performedByUserId?: string | null;
    };
    const productId = body.productId?.trim();
    if (!productId || !isValidMovementType(body.type)) {
      return NextResponse.json({ ok: false, error: "חסרים שדות או סוג תנועה לא תקין" }, { status: 400 });
    }

    const actorId = body.performedByUserId?.trim() || session.sub;
    const actor = await prisma.user.findFirst({
      where: { id: actorId, isActive: true },
      select: { id: true },
    });
    if (!actor) {
      return NextResponse.json({ ok: false, error: "משתמש מבצע לא נמצא" }, { status: 400 });
    }

    const qty = Number(body.quantity);
    if (!Number.isFinite(qty)) {
      return NextResponse.json({ ok: false, error: "כמות לא תקינה" }, { status: 400 });
    }

    const delta = inventoryMovementDelta(body.type, qty);
    if (body.type !== "STOCK_FIX" && body.type !== "TRANSFER" && delta === 0) {
      return NextResponse.json({ ok: false, error: "כמות חייבת להיות חיובית" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("מוצר לא נמצא");

      const nextStock = Math.max(0, product.currentStock + delta);

      const movement = await tx.inventoryMovement.create({
        data: {
          productId,
          type: body.type,
          quantity: body.type === "STOCK_FIX" ? Math.trunc(qty) : Math.trunc(Math.abs(qty)),
          notes: body.notes?.trim() || null,
          createdById: actor.id,
        },
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          currentStock: nextStock,
          lastStockAt: new Date(),
          lastStockById: actor.id,
        },
      });

      return { movement, currentStock: nextStock };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    const status = msg === "מוצר לא נמצא" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
