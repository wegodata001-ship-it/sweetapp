import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

/** POST — שמירת שורת ספירה בודדת (auto-save) */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      inventoryProductId?: string;
      productId?: string;
      currentQuantity?: number;
      countedQuantity?: number;
      actualQty?: number;
      countDate?: string | null;
      note?: string | null;
    };

    const pid = (body.inventoryProductId ?? body.productId)?.trim();
    if (!pid) {
      return NextResponse.json({ ok: false, error: "חסר מזהה מוצר" }, { status: 400 });
    }

    const currentQuantity = Number(
      body.currentQuantity ?? body.countedQuantity ?? body.actualQty,
    );
    if (!Number.isFinite(currentQuantity) || currentQuantity < 0) {
      return NextResponse.json({ ok: false, error: "כמות לא תקינה" }, { status: 400 });
    }

    const rawDate = body.countDate?.trim();
    const countDate = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(countDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך ספירה לא תקין" }, { status: 400 });
    }

    const product = await prismaAny.inventoryProduct.findFirst({
      where: { id: pid },
      select: { id: true },
    });
    if (!product) {
      return NextResponse.json({ ok: false, error: "מוצר לא נמצא" }, { status: 404 });
    }

    const previous = await prismaAny.inventoryCount.findFirst({
      where: { inventoryProductId: pid },
      orderBy: { countDate: "desc" },
      select: { currentQuantity: true },
    });
    const previousQuantity = previous?.currentQuantity ?? 0;

    if (previousQuantity === currentQuantity) {
      return NextResponse.json({
        ok: true,
        data: {
          skipped: true,
          inventoryProductId: pid,
          previousQuantity,
          currentQuantity,
          difference: 0,
        },
      });
    }

    const difference = currentQuantity - previousQuantity;
    const noteText = body.note?.trim() ?? "";
    const row = await prismaAny.inventoryCount.create({
      data: {
        inventoryProductId: pid,
        countDate,
        previousQuantity,
        currentQuantity,
        difference,
        note: noteText || null,
        countedByUserId: session.sub,
      },
      select: {
        id: true,
        countDate: true,
        createdAt: true,
        countedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        skipped: false,
        id: row.id,
        inventoryProductId: pid,
        previousQuantity,
        currentQuantity,
        difference,
        countDate: row.countDate.toISOString(),
        createdAt: row.createdAt.toISOString(),
        countedBy: row.countedBy,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
