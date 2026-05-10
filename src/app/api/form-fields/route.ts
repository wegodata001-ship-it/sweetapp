import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.formFieldDef.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return NextResponse.json({ ok: true, data: rows });
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
  try {
    const body = (await req.json()) as { label: string; sortOrder?: number };
    if (!body.label?.trim()) return NextResponse.json({ ok: false, error: "חסר טקסט" }, { status: 400 });
    const row = await prisma.formFieldDef.create({
      data: { label: body.label.trim(), sortOrder: body.sortOrder ?? 0 },
    });
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
