import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { productsOnShelfWhere, resolveShelf } from "@/lib/inventory/shelf-service";
import { LATEST_COUNT_ORDER_BY } from "@/lib/inventory/count-latest";

/** GET — ייצוא CSV של ספירה אחרונה למיקום */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const shelfName = req.nextUrl.searchParams.get("name")?.trim() || undefined;

  try {
    const shelf = await resolveShelf(id === "by-name" ? null : id, shelfName);
    if (!shelf) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }

    const products = await prismaAny.inventoryProduct.findMany({
      where: productsOnShelfWhere(shelf),
      orderBy: { name: "asc" },
      select: {
        name: true,
        unit: true,
        minimumQuantity: true,
        counts: {
          orderBy: LATEST_COUNT_ORDER_BY,
          take: 1,
          select: {
            previousQuantity: true,
            currentQuantity: true,
            difference: true,
            countDate: true,
            countedBy: { select: { fullName: true } },
          },
        },
      },
    });

    const header = [
      "מוצר",
      "יחידה",
      "מינימום",
      "קודם",
      "נוכחי",
      "הפרש",
      "תאריך ספירה",
      "נספר ע״י",
    ];
    const lines = [header.join(",")];
    for (const p of products) {
      const c = p.counts[0];
      const cells = [
        p.name,
        p.unit ?? "",
        String(p.minimumQuantity ?? 0),
        c ? String(c.previousQuantity) : "",
        c ? String(c.currentQuantity) : "",
        c ? String(c.difference) : "",
        c ? c.countDate.toISOString().slice(0, 10) : "",
        c?.countedBy?.fullName ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }

    const bom = "\uFEFF";
    const csv = bom + lines.join("\n");
    const filename = `count-${shelf.name.replace(/[^\w\u0590-\u05FF-]+/g, "_")}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
