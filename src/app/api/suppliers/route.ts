import { NextRequest, NextResponse } from "next/server";
import { invalidateDashboardCaches } from "@/lib/dashboard/invalidate";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { findOrCreateSupplier, isDatabaseSaveError } from "@/lib/finance/supplier-resolve";

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
    const row = await prisma.$transaction(async (tx) => {
      const resolved = await findOrCreateSupplier(tx, body.name);
      if (!resolved) return null;
      return tx.supplier.findUnique({ where: { id: resolved.id } });
    });
    if (!row) return NextResponse.json({ ok: false, error: "חסר שם" }, { status: 400 });
    invalidateDashboardCaches();
    return NextResponse.json({ ok: true, data: row });
  } catch (e) {
    if (isDatabaseSaveError(e)) {
      console.error("supplier save failed");
      return NextResponse.json({ ok: false, error: "לא נשמר המסמך" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
