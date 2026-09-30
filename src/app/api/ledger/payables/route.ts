import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { EXPENSE_OBLIGATION_DOC_SELECT } from "@/lib/finance/expense-obligation";
import { openPayableRows, type OpenPayableParty } from "@/lib/finance/open-payables";
import type { EntrySourceRow } from "@/lib/finance/ledger-route-map";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const block = await requireDb();
  if (block) return block;

  try {
    const [suppliers, employees, entries] = await Promise.all([
      prisma.supplier.findMany({
        select: { id: true, name: true, openingBalance: true },
      }),
      prisma.employee.findMany({
        select: { id: true, name: true, openingBalance: true },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          OR: [{ supplierId: { not: null } }, { employeeId: { not: null } }],
        },
        select: {
          id: true,
          debit: true,
          credit: true,
          entryDate: true,
          docType: true,
          description: true,
          financialDocumentId: true,
          supplierId: true,
          employeeId: true,
        },
      }),
    ]);

    const parties: OpenPayableParty[] = [
      ...suppliers.map((row) => ({
        id: row.id,
        entityType: "supplier" as const,
        name: row.name,
        openingBalance: row.openingBalance,
      })),
      ...employees.map((row) => ({
        id: row.id,
        entityType: "employee" as const,
        name: row.name,
        openingBalance: row.openingBalance,
      })),
    ];

    const docIds = [
      ...new Set(
        entries
          .map((row) => row.financialDocumentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const expenseDocuments =
      docIds.length > 0
        ? await prisma.financialDocument.findMany({
            where: { id: { in: docIds } },
            select: EXPENSE_OBLIGATION_DOC_SELECT,
          })
        : [];

    const result = openPayableRows({
      parties,
      entries: entries as EntrySourceRow[],
      expenseDocuments,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[ledger-payables]", error);
    return NextResponse.json({ ok: false, error: "LOAD_FAILED" }, { status: 500 });
  }
}
