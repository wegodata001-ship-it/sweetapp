import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { EntityType, LedgerOverviewRow } from "@/lib/finance/types";
import {
  buildLedgerOverviewPage,
  LEDGER_MASTER_SAFETY_CAP,
  type LedgerMasterEntity,
} from "@/lib/finance/ledger-overview-entities";
import {
  overviewRowFromEntityStatement,
  statementForCustomer,
  statementForEntryEntity,
} from "@/lib/finance/ledger-route-map";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const sp = req.nextUrl.searchParams;
  const qRaw = sp.get("q")?.trim() ?? "";
  const rawEntityType = sp.get("entityType")?.trim() ?? "";
  const entityTypeFilter: "all" | EntityType =
    rawEntityType === "customer" || rawEntityType === "supplier" || rawEntityType === "employee"
      ? rawEntityType
      : "all";
  const entityIdFilter = sp.get("entityId")?.trim() ?? "";
  const dateFrom = sp.get("dateFrom")?.trim() || null;
  const dateTo = sp.get("dateTo")?.trim() || null;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(sp.get("pageSize") ?? "10", 10) || 10));

  try {
    const fetchCustomers = entityTypeFilter === "all" || entityTypeFilter === "customer";
    const fetchSuppliers = entityTypeFilter === "all" || entityTypeFilter === "supplier";
    const fetchEmployees = entityTypeFilter === "all" || entityTypeFilter === "employee";

    const [customerRows, supplierRows, employeeRows] = await Promise.all([
      fetchCustomers
        ? prisma.customer.findMany({
            orderBy: { name: "asc" },
            take: LEDGER_MASTER_SAFETY_CAP,
            select: { id: true, name: true, openingBalance: true },
          })
        : Promise.resolve([]),
      fetchSuppliers
        ? prisma.supplier.findMany({
            orderBy: { name: "asc" },
            take: LEDGER_MASTER_SAFETY_CAP,
            select: { id: true, name: true, openingBalance: true, notes: true },
          })
        : Promise.resolve([]),
      fetchEmployees
        ? prisma.employee.findMany({
            orderBy: { name: "asc" },
            take: LEDGER_MASTER_SAFETY_CAP,
            select: { id: true, name: true, openingBalance: true },
          })
        : Promise.resolve([]),
    ]);

    const customers: LedgerMasterEntity[] = customerRows.map((c) => ({
      entity_type: "customer" as const,
      id: c.id,
      name: c.name,
      opening_balance: c.openingBalance,
    }));
    const suppliers: LedgerMasterEntity[] = supplierRows.map((s) => ({
      entity_type: "supplier" as const,
      id: s.id,
      name: s.name,
      opening_balance: s.openingBalance,
      notes: s.notes,
    }));
    const employees: LedgerMasterEntity[] = employeeRows.map((e) => ({
      entity_type: "employee" as const,
      id: e.id,
      name: e.name,
      opening_balance: e.openingBalance,
    }));

    const overview = buildLedgerOverviewPage({
      customers,
      suppliers,
      employees,
      q: qRaw,
      entityType: entityTypeFilter,
      entityId: entityIdFilter,
      page,
      pageSize,
    });

    const pageRows = overview.rows;
    const custIds = pageRows.filter((r) => r.entity_type === "customer").map((r) => r.id);
    const supIds = pageRows.filter((r) => r.entity_type === "supplier").map((r) => r.id);
    const empIds = pageRows.filter((r) => r.entity_type === "employee").map((r) => r.id);

    const [documents, payments, supLedger, empLedger] = await Promise.all([
      custIds.length > 0
        ? prisma.financialDocument.findMany({
            where: { customerId: { in: custIds } },
            select: {
              id: true,
              customerId: true,
              documentType: true,
              category: true,
              title: true,
              totalAmount: true,
              docDate: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      custIds.length > 0
        ? prisma.payment.findMany({
            where: { customerId: { in: custIds } },
            select: {
              id: true,
              customerId: true,
              amount: true,
              createdAt: true,
              documentId: true,
              document: { select: { title: true } },
            },
          })
        : Promise.resolve([]),
      supIds.length > 0
        ? prisma.ledgerEntry.findMany({
            where: { supplierId: { in: supIds } },
            select: {
              id: true,
              debit: true,
              credit: true,
              entryDate: true,
              docType: true,
              description: true,
              financialDocumentId: true,
              supplierId: true,
            },
          })
        : Promise.resolve([]),
      empIds.length > 0
        ? prisma.ledgerEntry.findMany({
            where: { employeeId: { in: empIds } },
            select: {
              id: true,
              debit: true,
              credit: true,
              entryDate: true,
              docType: true,
              description: true,
              financialDocumentId: true,
              employeeId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const paySources = payments.map((p) => ({
      id: p.id,
      customerId: p.customerId,
      amount: p.amount,
      createdAt: p.createdAt,
      documentId: p.documentId,
      documentTitle: p.document?.title ?? null,
    }));

    const rows: LedgerOverviewRow[] = pageRows.map((entity) => {
      if (entity.entity_type === "customer") {
        return overviewRowFromEntityStatement(
          entity,
          statementForCustomer({
            id: entity.id,
            name: entity.name,
            openingBalance: entity.opening_balance,
            documents,
            payments: paySources,
            dateFrom,
            dateTo,
          }),
        );
      }
      return overviewRowFromEntityStatement(
        entity,
        statementForEntryEntity({
          entityType: entity.entity_type,
          id: entity.id,
          name: entity.name,
          openingBalance: entity.opening_balance,
          entries: entity.entity_type === "supplier" ? supLedger : empLedger,
          dateFrom,
          dateTo,
        }),
      );
    });

    return NextResponse.json({
      ok: true,
      counts: overview.counts,
      total: overview.total,
      page,
      pageSize,
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
