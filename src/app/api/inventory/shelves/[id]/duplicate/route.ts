import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  productsOnShelfWhere,
  resolveShelf,
  summarizeShelf,
  uniqueShelfCopyName,
} from "@/lib/inventory/shelf-service";

/**
 * POST — שכפול מדף: מדף חדש + העתקת שיוכי מוצרים (אותן כמויות נשארות על המוצר).
 * המוצרים מועברים למדף העותק (מודל שיוך יחיד למוצר).
 */
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
  const body = (await req.json().catch(() => ({}))) as { shelfName?: string };
  const src = await resolveShelf(
    paramId === "by-name" ? null : paramId,
    body.shelfName?.trim(),
  );
  if (!src) {
    return NextResponse.json({ ok: false, error: "מדף לא נמצא" }, { status: 404 });
  }

  try {
    const newName = await uniqueShelfCopyName(src.name);
    const where = productsOnShelfWhere(src);

    const data = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      const srcLoc =
        src.id != null
          ? await tx.inventoryLocation.findUnique({
              where: { id: src.id },
              select: { description: true },
            })
          : null;

      const newLoc = await tx.inventoryLocation.create({
        data: {
          name: newName,
          description: srcLoc?.description ?? null,
          isActive: true,
        },
      });

      const moved = await tx.inventoryProduct.updateMany({
        where,
        data: { locationId: newLoc.id, location: newName },
      });

      return {
        shelf: {
          id: newLoc.id,
          name: newLoc.name,
          description: newLoc.description,
        },
        productCount: moved.count,
      };
    });

    const summary = await summarizeShelf({ id: data.shelf.id, name: data.shelf.name });
    const sourceSummary = await summarizeShelf(src);

    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        summary,
        sourceSummary,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return NextResponse.json({ ok: false, error: "שם מדף כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg || "שגיאה" }, { status: 500 });
  }
}
