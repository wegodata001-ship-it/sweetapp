import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { EntityType, FinanceEntityRow } from "@/lib/finance/types";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const type = req.nextUrl.searchParams.get("type") as EntityType | null;
  if (!type || !["supplier", "customer", "employee"].includes(type)) {
    return NextResponse.json({ ok: false, error: "type נדרש" }, { status: 400 });
  }
  try {
    let data: FinanceEntityRow[] = [];
    if (type === "customer") {
      const rows = await prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
      data = rows.map((r) => ({
        id: r.id,
        entity_type: "customer" as const,
        name: r.name,
        opening_balance: r.openingBalance,
      }));
    } else if (type === "supplier") {
      const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
      data = rows.map((r) => ({
        id: r.id,
        entity_type: "supplier" as const,
        name: r.name,
        opening_balance: r.openingBalance,
      }));
    } else {
      const rows = await prisma.employee.findMany({ orderBy: { name: "asc" } });
      data = rows.map((r) => ({
        id: r.id,
        entity_type: "employee" as const,
        name: r.name,
        opening_balance: r.openingBalance,
      }));
    }
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
