import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const row = await prisma.financeSettings.findUnique({ where: { id: 1 } });
    return NextResponse.json({ ok: true, cashOpeningBalance: row?.cashOpeningBalance ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const body = (await req.json()) as { cashOpeningBalance: number };
    if (typeof body.cashOpeningBalance !== "number" || Number.isNaN(body.cashOpeningBalance)) {
      return NextResponse.json({ ok: false, error: "סכום לא תקין" }, { status: 400 });
    }
    const row = await prisma.financeSettings.upsert({
      where: { id: 1 },
      create: { id: 1, cashOpeningBalance: body.cashOpeningBalance },
      update: { cashOpeningBalance: body.cashOpeningBalance },
    });
    return NextResponse.json({ ok: true, cashOpeningBalance: row.cashOpeningBalance });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
