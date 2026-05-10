import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as { label?: string; sortOrder?: number };
    const row = await prisma.formFieldDef.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label.trim() } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
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

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    await prisma.formFieldDef.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
