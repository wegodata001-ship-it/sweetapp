import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: string;
      location?: string | null;
      unit?: string | null;
      category?: string | null;
      minimumQuantity?: number;
    };
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ ok: false, error: "שם פריט חובה" }, { status: 400 });
      data.name = name;
    }
    if (body.location !== undefined) {
      const loc = body.location?.trim();
      if (!loc) return NextResponse.json({ ok: false, error: "מיקום חובה" }, { status: 400 });
      data.location = loc;
    }
    if (body.unit !== undefined) data.unit = body.unit?.trim() || null;
    if (body.category !== undefined) {
      const c = body.category?.trim();
      data.category = c && c.length > 0 ? c : "כללי";
    }
    if (body.minimumQuantity !== undefined) {
      const n = Number(body.minimumQuantity);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ ok: false, error: "מינימום לא תקין" }, { status: 400 });
      }
      data.minimumQuantity = n;
    }

    const row = await prisma.inventoryProduct.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
