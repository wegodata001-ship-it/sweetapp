import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

/**
 * PATCH — סדר מקומות אחסון (Drag & Drop) → InventoryLocation.displayOrder
 * שמירה אחת אחרי Drop. לא נוגע בספירות / היסטוריה.
 */
export async function PATCH(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { locationIds?: string[] };
    const locationIds = Array.isArray(body.locationIds)
      ? body.locationIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];

    if (locationIds.length === 0) {
      return NextResponse.json({ ok: false, error: "חסרים מזהי מיקומים" }, { status: 400 });
    }
    if (locationIds.length > 500) {
      return NextResponse.json({ ok: false, error: "יותר מדי מיקומים" }, { status: 400 });
    }

    const uniqueFront = [...new Set(locationIds)];
    const all = (await prismaAny.inventoryLocation.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    })) as { id: string }[];
    const allSet = new Set(all.map((l) => l.id));
    const front = uniqueFront.filter((id) => allSet.has(id));
    const frontSet = new Set(front);
    const rest = all.map((l) => l.id).filter((id) => !frontSet.has(id));
    const ordered = [...front, ...rest];

    await prismaAny.$transaction(
      ordered.map((id, index) =>
        prismaAny.inventoryLocation.update({
          where: { id },
          data: { displayOrder: index + 1 },
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      data: { saved: ordered.length, locationIds: ordered },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
