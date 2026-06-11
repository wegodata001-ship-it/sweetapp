import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export type ArchiveCounterpartyOption = {
  kind: "customer" | "supplier" | "employee";
  id: string;
  name: string;
};

export function archiveCounterpartyKey(kind: ArchiveCounterpartyOption["kind"], id: string): string {
  return `${kind}:${id}`;
}

const VALID_KINDS = new Set(["customer", "supplier", "employee"]);

/** GET /api/finance/counterparties?q=&kind= — רשימה מאוחדת לסינון ארכיון */
export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const rawKind = req.nextUrl.searchParams.get("kind")?.trim() ?? "";
  const kindFilter = VALID_KINDS.has(rawKind) ? (rawKind as ArchiveCounterpartyOption["kind"]) : null;
  const nameFilter = q ? { name: { contains: q, mode: "insensitive" as const } } : undefined;

  try {
    const [customers, suppliers, employees] = await Promise.all([
      !kindFilter || kindFilter === "customer"
        ? prisma.customer.findMany({
            where: nameFilter,
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: q ? 20 : 400,
          })
        : Promise.resolve([]),
      !kindFilter || kindFilter === "supplier"
        ? prisma.supplier.findMany({
            where: nameFilter,
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: q ? 20 : 400,
          })
        : Promise.resolve([]),
      !kindFilter || kindFilter === "employee"
        ? prisma.employee.findMany({
            where: { isActive: true, ...(nameFilter ? nameFilter : {}) },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
            take: q ? 20 : 400,
          })
        : Promise.resolve([]),
    ]);

    const data: ArchiveCounterpartyOption[] = [
      ...customers.map((c) => ({ kind: "customer" as const, id: c.id, name: c.name })),
      ...suppliers.map((s) => ({ kind: "supplier" as const, id: s.id, name: s.name })),
      ...employees.map((e) => ({ kind: "employee" as const, id: e.id, name: e.name })),
    ].sort((a, b) => a.name.localeCompare(b.name, "he"));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
