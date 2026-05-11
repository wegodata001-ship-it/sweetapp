import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.inventoryProduct.findMany({
      orderBy: [{ location: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        location: true,
        category: true,
        minimumQuantity: true,
        unit: true,
        createdAt: true,
        _count: { select: { counts: true } },
      },
    });
    return NextResponse.json({
      ok: true,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        location: row.location,
        category: row.category,
        minimumQuantity: row.minimumQuantity,
        unit: row.unit,
        countsCount: row._count.counts,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      name?: string;
      location?: string | null;
      unit?: string | null;
      category?: string | null;
      minimumQuantity?: number;
    };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "חסר שם פריט" }, { status: 400 });
    const location = body.location?.trim();
    if (!location) return NextResponse.json({ ok: false, error: "חובה לציין מיקום" }, { status: 400 });
    const category = body.category?.trim() || "כללי";
    let minimumQuantity = 0;
    if (body.minimumQuantity !== undefined) {
      const n = Number(body.minimumQuantity);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, error: "מינימום לא תקין" }, { status: 400 });
      }
      minimumQuantity = n;
    }

    const row = await prisma.inventoryProduct.create({
      data: {
        name,
        location,
        category,
        minimumQuantity,
        unit: body.unit?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
