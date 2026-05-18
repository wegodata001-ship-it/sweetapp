import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as {
    name?: string;
    description?: string | null;
    isActive?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ ok: false, error: "שם ריק" }, { status: 400 });
    data.name = name;
  }
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
  }

  try {
    const row = await prismaAny.inventoryLocation.update({ where: { id }, data });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return NextResponse.json({ ok: false, error: "שם מיקום כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg || "שגיאה" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const cnt = await prismaAny.inventoryProduct.count({ where: { locationId: id } });
    if (cnt > 0) {
      await prismaAny.inventoryLocation.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ ok: true, data: { deactivated: true, linkedProducts: cnt } });
    }
    await prismaAny.inventoryLocation.delete({ where: { id } });
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
