import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { productsOnShelfWhere, resolveShelf } from "@/lib/inventory/shelf-service";

/**
 * PATCH — שמירת סדר מוצרים (Drag & Drop) ב־InventoryProduct.displayOrder
 * Additive / backward compatible — לא נוגע בספירות / היסטוריה.
 *
 * מקבל את הסדר של המוצרים הטעונים במסך; משלב עם שאר מוצרי המדף
 * (שעדיין לא נטענו ב־infinite scroll) כדי לא לשבור pagination.
 */
export async function PATCH(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      productIds?: string[];
      locationId?: string | null;
      location?: string | null;
    };
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ ok: false, error: "חסרים מזהי מוצרים" }, { status: 400 });
    }
    if (productIds.length > 2000) {
      return NextResponse.json({ ok: false, error: "יותר מדי מוצרים" }, { status: 400 });
    }

    const shelf = await resolveShelf(body.locationId?.trim() ?? null, body.location?.trim());
    if (!shelf) {
      return NextResponse.json({ ok: false, error: "מיקום לא נמצא" }, { status: 404 });
    }

    const uniqueFront = [...new Set(productIds)];
    const shelfProducts = (await prismaAny.inventoryProduct.findMany({
      where: productsOnShelfWhere(shelf),
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    })) as { id: string }[];

    const shelfSet = new Set(shelfProducts.map((p) => p.id));
    const front = uniqueFront.filter((id) => shelfSet.has(id));
    const frontSet = new Set(front);
    const rest = shelfProducts.map((p) => p.id).filter((id) => !frontSet.has(id));
    const ordered = [...front, ...rest];

    if (ordered.length === 0) {
      return NextResponse.json({ ok: false, error: "לא נמצאו מוצרים" }, { status: 400 });
    }

    await prismaAny.$transaction(
      ordered.map((id, index) =>
        prismaAny.inventoryProduct.update({
          where: { id },
          data: { displayOrder: index + 1 },
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      data: { saved: ordered.length, productIds: ordered },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
