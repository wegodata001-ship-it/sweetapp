import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  ensureProductOnShelf,
  productsOnShelfWhere,
  resolveShelf,
  summarizeShelf,
} from "@/lib/inventory/shelf-service";

/** POST — העברת מוצרים ממיקום זה למיקום יעד (ללא מחיקת ספירות) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      targetLocationId?: string;
      productIds?: string[];
      shelfName?: string;
    };
    const targetId = body.targetLocationId?.trim();
    if (!targetId) {
      return NextResponse.json({ ok: false, error: "חסר מיקום יעד" }, { status: 400 });
    }

    const source = await resolveShelf(id === "by-name" ? null : id, body.shelfName);
    if (!source) {
      return NextResponse.json({ ok: false, error: "מיקום מקור לא נמצא" }, { status: 404 });
    }

    const target = await prismaAny.inventoryLocation.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, isActive: true },
    });
    if (!target || !target.isActive) {
      return NextResponse.json({ ok: false, error: "מיקום יעד לא נמצא" }, { status: 404 });
    }
    if (source.id && source.id === target.id) {
      return NextResponse.json({ ok: false, error: "מיקום זהה" }, { status: 400 });
    }

    const where = productsOnShelfWhere(source);
    const productIds = Array.isArray(body.productIds)
      ? body.productIds.map((x) => String(x).trim()).filter(Boolean)
      : [];

    const updateWhere =
      productIds.length > 0
        ? { AND: [where, { id: { in: productIds } }] }
        : where;

    const products = await prismaAny.inventoryProduct.findMany({
      where: updateWhere,
      select: { id: true },
    });

    const moved = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      let count = 0;
      for (const p of products) {
        await ensureProductOnShelf(tx, p.id, target.id);
        if (source.id) {
          await tx.inventoryProductOnLocation.deleteMany({
            where: { inventoryProductId: p.id, locationId: source.id },
          });
        }
        await tx.inventoryProduct.update({
          where: { id: p.id },
          data: {
            locationId: target.id,
            location: target.name,
          },
        });
        count += 1;
      }
      return count;
    });

    if (productIds.length > 0 && moved === 0) {
      return NextResponse.json(
        { ok: false, error: "המוצר לא נמצא במיקום המקור" },
        { status: 404 },
      );
    }

    const [sourceSummary, targetSummary] = await Promise.all([
      summarizeShelf(source),
      summarizeShelf({ id: target.id, name: target.name }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        moved,
        sourceSummary,
        targetSummary,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
