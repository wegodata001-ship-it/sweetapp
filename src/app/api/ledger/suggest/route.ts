import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { mixLedgerSuggestions, type LedgerEntityRef } from "@/lib/finance/recent-ledger-activity";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ ok: true, data: [] satisfies LedgerEntityRef[] });
  try {
    const where = {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
      ],
    };
    const [customers, suppliers, employees] = await Promise.all([
      prisma.customer.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 8 }),
      prisma.supplier.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 8 }),
      prisma.employee.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 8 }),
    ]);
    const data = mixLedgerSuggestions([
      customers.map((row) => ({ entityType: "customer" as const, entityId: row.id, entityName: row.name })),
      suppliers.map((row) => ({ entityType: "supplier" as const, entityId: row.id, entityName: row.name })),
      employees.map((row) => ({ entityType: "employee" as const, entityId: row.id, entityName: row.name })),
    ]);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("ledger suggest failed");
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
