import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  ensureProductOnShelf,
  orderedProductIdsOnShelf,
  resolveShelf,
} from "@/lib/inventory/shelf-service";

/**
 * PATCH — סדר מוצרים בתוך מקום אחסון (Drag & Drop).
 * נשמר ב־InventoryProductOnLocation.displayOrder — לא משפיע על מחסנים אחרים.
 * לא נוגע בספירות / היסטוריה.
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
    if (!shelf?.id) {
      return NextResponse.json({ ok: false, error: "מיקום לא נמצא" }, { status: 404 });
    }
    const locationId = shelf.id;

    const uniqueFront = [...new Set(productIds)];
    const shelfOrdered = await orderedProductIdsOnShelf(shelf);
    const shelfSet = new Set(shelfOrdered);
    const front = uniqueFront.filter((id) => shelfSet.has(id));
    const frontSet = new Set(front);
    const rest = shelfOrdered.filter((id) => !frontSet.has(id));
    const ordered = [...front, ...rest];

    if (ordered.length === 0) {
      return NextResponse.json({ ok: false, error: "לא נמצאו מוצרים" }, { status: 400 });
    }

    await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      for (let index = 0; index < ordered.length; index++) {
        const productId = ordered[index]!;
        await ensureProductOnShelf(tx, productId, locationId);
        await tx.inventoryProductOnLocation.update({
          where: {
            inventoryProductId_locationId: {
              inventoryProductId: productId,
              locationId,
            },
          },
          data: { displayOrder: index + 1 },
        });
      }
    });

    return NextResponse.json({
      ok: true,
      data: { saved: ordered.length, productIds: ordered, locationId },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
