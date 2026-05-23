import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  productsOnShelfWhere,
  resolveShelf,
  summarizeShelf,
} from "@/lib/inventory/shelf-service";

/** POST — הוספת מוצר למדף (שיוך + כמות אופציונלית) */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id: paramId } = await ctx.params;
  const body = (await req.json()) as {
    shelfName?: string;
    productId?: string;
    quantity?: number;
    slotNote?: string | null;
    increaseIfExists?: boolean;
    countDate?: string | null;
  };

  const shelf = await resolveShelf(
    paramId === "by-name" ? null : paramId,
    body.shelfName?.trim(),
  );
  if (!shelf) {
    return NextResponse.json({ ok: false, error: "מדף לא נמצא" }, { status: 404 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json({ ok: false, error: "חסר מוצר" }, { status: 400 });
  }

  const qty =
    body.quantity !== undefined && body.quantity !== null ? Number(body.quantity) : null;
  if (qty !== null && (!Number.isFinite(qty) || qty < 0)) {
    return NextResponse.json({ ok: false, error: "כמות לא תקינה" }, { status: 400 });
  }

  try {
    const product = await prismaAny.inventoryProduct.findFirst({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        locationId: true,
        location: true,
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: { currentQuantity: true },
        },
      },
    });
    if (!product) {
      return NextResponse.json({ ok: false, error: "מוצר לא נמצא" }, { status: 404 });
    }

    const onShelf =
      (shelf.id && product.locationId === shelf.id) ||
      product.location.trim().toLowerCase() === shelf.name.trim().toLowerCase();

    if (onShelf && !body.increaseIfExists) {
      return NextResponse.json({
        ok: false,
        code: "ALREADY_ON_SHELF",
        error: "המוצר כבר קיים במדף",
        data: { productId, currentQuantity: product.counts[0]?.currentQuantity ?? 0 },
      });
    }

    const countDate = body.countDate?.trim()
      ? new Date(body.countDate)
      : new Date();
    if (Number.isNaN(countDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
    }

    let resolvedShelf = shelf;
    const result = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      let locationId = resolvedShelf.id;
      if (!locationId) {
        const created = await tx.inventoryLocation.create({
          data: { name: resolvedShelf.name, isActive: true },
        });
        locationId = created.id;
        resolvedShelf = { id: created.id, name: resolvedShelf.name };
      }

      await tx.inventoryProduct.update({
        where: { id: productId },
        data: {
          locationId,
          location: resolvedShelf.name,
        },
      });

      let countRow = null;
      if (qty !== null) {
        const previous = product.counts[0]?.currentQuantity ?? 0;
        const targetQty = onShelf && body.increaseIfExists ? previous + qty : qty;
        if (targetQty !== previous) {
          countRow = await tx.inventoryCount.create({
            data: {
              inventoryProductId: productId,
              countDate,
              previousQuantity: previous,
              currentQuantity: targetQty,
              difference: targetQty - previous,
              note: body.slotNote?.trim() || null,
              countedByUserId: session.sub,
            },
            select: { id: true, currentQuantity: true, difference: true },
          });
        }
      }

      return { locationId, countRow };
    });

    const summary = await summarizeShelf(resolvedShelf);

    return NextResponse.json({
      ok: true,
      data: {
        productId,
        shelf: summary,
        ...result,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
