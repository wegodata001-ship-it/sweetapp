import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { productsOnShelfWhere, resolveShelf } from "@/lib/inventory/shelf-service";

/** DELETE — מחיקת מדף: מסיר שיוך מוצרים, לא מוחק מוצרים */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id: paramId } = await ctx.params;
  const shelfName = _req.nextUrl.searchParams.get("name")?.trim() || undefined;
  const shelf = await resolveShelf(paramId === "by-name" ? null : paramId, shelfName);
  if (!shelf) {
    return NextResponse.json({ ok: false, error: "מדף לא נמצא" }, { status: 404 });
  }

  try {
    const where = productsOnShelfWhere(shelf);
    const result = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      const unlinked = await tx.inventoryProduct.updateMany({
        where,
        data: { locationId: null, location: "" },
      });
      if (shelf.id) {
        await tx.inventoryLocation.delete({ where: { id: shelf.id } }).catch(() => {
          /* legacy shelf without row */
        });
      }
      return { unlinkedCount: unlinked.count };
    });

    return NextResponse.json({
      ok: true,
      data: { name: shelf.name, ...result },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
