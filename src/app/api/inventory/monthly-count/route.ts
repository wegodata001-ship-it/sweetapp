import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      countDate: string;
      warehouseId?: string | null;
      lines: { productId: string; actualQty: number; notes?: string | null }[];
    };
    if (!body.countDate?.trim() || !Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ ok: false, error: "חסרים נתוני ספירה" }, { status: 400 });
    }

    const countDate = new Date(body.countDate.trim());
    if (Number.isNaN(countDate.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
    }

    const sessionId = randomUUID();
    const warehouseId = body.warehouseId?.trim() || null;
    if (warehouseId) {
      const wh = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
      if (!wh) {
        return NextResponse.json({ ok: false, error: "מחסן לא נמצא" }, { status: 400 });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const out: { id: string; productId: string }[] = [];
      for (const line of body.lines) {
        const pid = line.productId?.trim();
        if (!pid) continue;
        const actualQty = Math.trunc(Number(line.actualQty));
        if (!Number.isFinite(actualQty)) continue;

        const product = await tx.product.findUnique({ where: { id: pid } });
        if (!product) continue;

        const systemQty = product.currentStock;
        const difference = actualQty - systemQty;
        const row = await tx.inventoryCount.create({
          data: {
            sessionId,
            countDate,
            warehouseId,
            productId: pid,
            systemQty,
            actualQty,
            difference,
            notes: line.notes?.trim() || null,
            createdById: session.sub,
          },
        });
        out.push({ id: row.id, productId: pid });
      }
      return out;
    });

    if (created.length === 0) {
      return NextResponse.json({ ok: false, error: "לא נשמרו שורות — בדקו מזהי מוצר" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      data: { sessionId, saved: created.length, rows: created },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
