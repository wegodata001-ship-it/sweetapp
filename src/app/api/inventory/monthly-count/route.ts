import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const products = await prisma.inventoryProduct.findMany({
      orderBy: [{ location: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        location: true,
        unit: true,
        counts: {
          orderBy: { countDate: "desc" },
          take: 1,
          select: {
            currentQuantity: true,
            countDate: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: products.map((p) => ({
        id: p.id,
        name: p.name,
        location: p.location,
        unit: p.unit,
        previousQuantity: p.counts[0]?.currentQuantity ?? 0,
        lastCountedAt: p.counts[0]?.countDate.toISOString() ?? null,
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
      countDate?: string | null;
      countedAt?: string | null;
      lines: {
        inventoryProductId?: string;
        productId?: string;
        currentQuantity?: number;
        countedQuantity?: number;
        actualQty?: number;
        note?: string | null;
        notes?: string | null;
      }[];
    };
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ ok: false, error: "חסרים נתוני ספירה" }, { status: 400 });
    }

    const rawDate = body.countDate?.trim() || body.countedAt?.trim();
    const countDate = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(countDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך ספירה לא תקין" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const out: {
        id: string;
        inventoryProductId: string;
        previousQuantity: number;
        currentQuantity: number;
        difference: number;
      }[] = [];
      for (const line of body.lines) {
        const pid = (line.inventoryProductId ?? line.productId)?.trim();
        if (!pid) continue;
        const currentQuantity = Number(line.currentQuantity ?? line.countedQuantity ?? line.actualQty);
        if (!Number.isFinite(currentQuantity)) continue;

        const product = await tx.inventoryProduct.findFirst({
          where: { id: pid },
          select: { id: true },
        });
        if (!product) continue;

        const previous = await tx.inventoryCount.findFirst({
          where: { inventoryProductId: pid },
          orderBy: { countDate: "desc" },
          select: { currentQuantity: true },
        });
        const previousQuantity = previous?.currentQuantity ?? 0;
        const difference = currentQuantity - previousQuantity;
        const noteText = line.note?.trim() ?? line.notes?.trim() ?? "";
        const row = await tx.inventoryCount.create({
          data: {
            inventoryProductId: pid,
            countDate,
            previousQuantity,
            currentQuantity,
            difference,
            note: noteText || null,
            countedByUserId: session.sub,
          },
        });
        out.push({
          id: row.id,
          inventoryProductId: pid,
          previousQuantity,
          currentQuantity,
          difference,
        });
      }
      return out;
    });

    if (created.length === 0) {
      return NextResponse.json({ ok: false, error: "לא נשמרו שורות — בדקו מזהי מוצר" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      data: { saved: created.length, rows: created },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
