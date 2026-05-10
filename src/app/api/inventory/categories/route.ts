import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as { name: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ ok: false, error: "חסר שם קטגוריה" }, { status: 400 });
    }
    const row = await prisma.productCategory.create({
      data: { name: body.name.trim() },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
