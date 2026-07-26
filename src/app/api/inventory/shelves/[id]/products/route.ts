import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  ensureProductOnShelf,
  resolveShelf,
  summarizeShelf,
} from "@/lib/inventory/shelf-service";
import { LATEST_COUNT_ORDER_BY } from "@/lib/inventory/count-latest";

/** POST — הוספת מוצר למדף (שיוך N:M + כמות אופציונלית) — לא מסיר ממיקומים אחרים */
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
        placements: { select: { locationId: true } },
        counts: {
          orderBy: LATEST_COUNT_ORDER_BY,
          take: 20,
          select: { currentQuantity: true, locationId: true },
        },
      },
    });
    if (!product) {
      return NextResponse.json({ ok: false, error: "מוצר לא נמצא" }, { status: 404 });
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
      if (!locationId) {
        throw new Error("לא ניתן ליצור מיקום אחסון");
      }

      const alreadyOn =
        product.placements.some((p: { locationId: string }) => p.locationId === locationId) ||
        product.locationId === locationId ||
        product.location.trim().toLowerCase() === resolvedShelf.name.trim().toLowerCase();

      if (alreadyOn && !body.increaseIfExists && qty === null) {
        return { alreadyOn: true as const, locationId, countRow: null };
      }

      await ensureProductOnShelf(tx, productId, locationId);

      // שומרים גם locationId ראשי לתאימות לאחור — בלי להסיר ממיקומים אחרים
      await tx.inventoryProduct.update({
        where: { id: productId },
        data: {
          locationId,
          location: resolvedShelf.name,
        },
      });

      const countDate = body.countDate?.trim() ? new Date(body.countDate) : new Date();
      if (Number.isNaN(countDate.getTime())) {
        throw new Error("תאריך לא תקין");
      }

      let countRow = null;
      if (qty !== null) {
        const prevForLoc =
          product.counts.find((c: { locationId: string | null }) => c.locationId === locationId)
            ?.currentQuantity ??
          (alreadyOn
            ? product.counts.find((c: { locationId: string | null }) => !c.locationId)
                ?.currentQuantity
            : undefined) ??
          0;
        const targetQty =
          alreadyOn && body.increaseIfExists ? prevForLoc + qty : qty;
        if (targetQty !== prevForLoc) {
          countRow = await tx.inventoryCount.create({
            data: {
              inventoryProductId: productId,
              locationId,
              countDate,
              previousQuantity: prevForLoc,
              currentQuantity: targetQty,
              difference: targetQty - prevForLoc,
              note: body.slotNote?.trim() || null,
              countedByUserId: session.sub,
            },
            select: { id: true, currentQuantity: true, difference: true },
          });
        }
      }

      return { alreadyOn: false as const, locationId, countRow };
    });

    if (result.alreadyOn) {
      const prevQty =
        product.counts.find(
          (c: { locationId: string | null }) => c.locationId === result.locationId,
        )?.currentQuantity ??
        product.counts[0]?.currentQuantity ??
        0;
      return NextResponse.json({
        ok: false,
        code: "ALREADY_ON_SHELF",
        error: "המוצר כבר קיים במדף",
        data: { productId, currentQuantity: prevQty },
      });
    }

    const summary = await summarizeShelf(resolvedShelf);

    return NextResponse.json({
      ok: true,
      data: {
        productId,
        shelf: summary,
        locationId: result.locationId,
        countRow: result.countRow,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
