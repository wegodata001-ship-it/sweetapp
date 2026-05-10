import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
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
    const body = (await req.json()) as { name: string; phone?: string | null; openingBalance?: number };
    if (!body.name?.trim()) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    const row = await prisma.supplier.create({
      data: {
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        openingBalance: body.openingBalance ?? 0,
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
