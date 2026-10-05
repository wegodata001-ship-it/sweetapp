import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export type ArchiveCounterpartyOption = {
  kind: "customer" | "supplier" | "employee";
  id: string;
  name: string;
};

const VALID_KINDS = new Set(["customer", "supplier", "employee"]);

function counterpartiesUnionSql(
  kindFilter: ArchiveCounterpartyOption["kind"] | null,
  q: string,
): Prisma.Sql {
  const take = q ? 20 : 400;
  const namePred = q ? Prisma.sql`AND name ILIKE ${`%${q}%`}` : Prisma.empty;
  const parts: Prisma.Sql[] = [];
  if (!kindFilter || kindFilter === "customer") {
    parts.push(Prisma.sql`
      (SELECT 'customer'::text AS kind, id, name FROM "Customer" WHERE TRUE ${namePred}
       ORDER BY name ASC LIMIT ${take})
    `);
  }
  if (!kindFilter || kindFilter === "supplier") {
    parts.push(Prisma.sql`
      (SELECT 'supplier'::text AS kind, id, name FROM "Supplier" WHERE TRUE ${namePred}
       ORDER BY name ASC LIMIT ${take})
    `);
  }
  if (!kindFilter || kindFilter === "employee") {
    parts.push(Prisma.sql`
      (SELECT 'employee'::text AS kind, id, name FROM "Employee"
       WHERE "isActive" = true ${namePred}
       ORDER BY name ASC LIMIT ${take})
    `);
  }
  return Prisma.sql`${Prisma.join(parts, " UNION ALL ")}`;
}

/** GET /api/finance/counterparties?q=&kind= — רשימה מאוחדת לסינון ארכיון */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rawKind = req.nextUrl.searchParams.get("kind")?.trim() ?? "";
  const kindFilter = VALID_KINDS.has(rawKind) ? (rawKind as ArchiveCounterpartyOption["kind"]) : null;

  try {
    const rows = await prisma.$queryRaw<ArchiveCounterpartyOption[]>`${counterpartiesUnionSql(kindFilter, q)}`;
    const data = [...rows].sort((a, b) => a.name.localeCompare(b.name, "he"));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
