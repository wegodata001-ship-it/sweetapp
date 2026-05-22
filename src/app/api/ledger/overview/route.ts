import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { EntityType, LedgerOverviewRow } from "@/lib/finance/types";

export const dynamic = "force-dynamic";

type UnifiedEntity = {
  entity_type: EntityType;
  id: string;
  name: string;
  opening_balance: number;
};

function docEntryDate(d: { docDate: Date | null; createdAt: Date }): string {
  return (d.docDate ?? d.createdAt).toISOString().slice(0, 10);
}

function inDateRange(isoDay: string, dateFrom: string | null, dateTo: string | null): boolean {
  if (!dateFrom?.trim() && !dateTo?.trim()) return true;
  if (dateFrom?.trim() && isoDay < dateFrom.trim()) return false;
  if (dateTo?.trim() && isoDay > dateTo.trim()) return false;
  return true;
}

function inPaymentRange(
  createdAt: Date,
  dateFrom: string | null,
  dateTo: string | null,
): boolean {
  if (!dateFrom?.trim() && !dateTo?.trim()) return true;
  const iso = createdAt.toISOString().slice(0, 10);
  return inDateRange(iso, dateFrom, dateTo);
}

function inLedgerRange(
  entryDate: Date,
  dateFrom: string | null,
  dateTo: string | null,
): boolean {
  if (!dateFrom?.trim() && !dateTo?.trim()) return true;
  const iso = entryDate.toISOString().slice(0, 10);
  return inDateRange(iso, dateFrom, dateTo);
}

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

  const nameWhere = qRaw
    ? ({ name: { contains: qRaw, mode: "insensitive" as const } } as const)
    : undefined;

  try {
    const listCap = entityIdFilter
      ? 1
      : Math.min(500, page * pageSize + pageSize);

    const fetchCustomers =
      !entityTypeFilter || entityTypeFilter === "all" || entityTypeFilter === "customer";
    const fetchSuppliers =
      !entityTypeFilter || entityTypeFilter === "all" || entityTypeFilter === "supplier";
    const fetchEmployees =
      !entityTypeFilter || entityTypeFilter === "all" || entityTypeFilter === "employee";

    const [customers, suppliers, employees, customerCount, supplierCount, employeeCount] =
      await Promise.all([
        fetchCustomers
          ? prisma.customer.findMany({
              where: nameWhere,
              orderBy: { name: "asc" },
              take: listCap,
              select: { id: true, name: true, openingBalance: true },
            })
          : Promise.resolve([]),
        fetchSuppliers
          ? prisma.supplier.findMany({
              where: nameWhere,
              orderBy: { name: "asc" },
              take: listCap,
              select: { id: true, name: true, openingBalance: true },
            })
          : Promise.resolve([]),
        fetchEmployees
          ? prisma.employee.findMany({
              where: nameWhere,
              orderBy: { name: "asc" },
              take: listCap,
              select: { id: true, name: true, openingBalance: true },
            })
          : Promise.resolve([]),
        fetchCustomers ? prisma.customer.count({ where: nameWhere }) : Promise.resolve(0),
        fetchSuppliers ? prisma.supplier.count({ where: nameWhere }) : Promise.resolve(0),
        fetchEmployees ? prisma.employee.count({ where: nameWhere }) : Promise.resolve(0),
      ]);

    const merged: UnifiedEntity[] = [];

    if (!entityTypeFilter || entityTypeFilter === "all") {
      merged.push(
        ...customers.map((c) => ({
          entity_type: "customer" as const,
          id: c.id,
          name: c.name,
          opening_balance: c.openingBalance,
        })),
        ...suppliers.map((s) => ({
          entity_type: "supplier" as const,
          id: s.id,
          name: s.name,
          opening_balance: s.openingBalance,
        })),
        ...employees.map((e) => ({
          entity_type: "employee" as const,
          id: e.id,
          name: e.name,
          opening_balance: e.openingBalance,
        })),
      );
    } else if (entityTypeFilter === "customer") {
      merged.push(
        ...customers.map((c) => ({
          entity_type: "customer" as const,
          id: c.id,
          name: c.name,
          opening_balance: c.openingBalance,
        })),
      );
    } else if (entityTypeFilter === "supplier") {
      merged.push(
        ...suppliers.map((s) => ({
          entity_type: "supplier" as const,
          id: s.id,
          name: s.name,
          opening_balance: s.openingBalance,
        })),
      );
    } else if (entityTypeFilter === "employee") {
      merged.push(
        ...employees.map((e) => ({
          entity_type: "employee" as const,
          id: e.id,
          name: e.name,
          opening_balance: e.openingBalance,
        })),
      );
    }

    let filtered = merged;
    if (entityIdFilter) {
      filtered = merged.filter((e) => e.id === entityIdFilter);
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name, "he"));

    const total = entityIdFilter
      ? filtered.length
      : customerCount + supplierCount + employeeCount;
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    const custIds = pageRows.filter((r) => r.entity_type === "customer").map((r) => r.id);
    const supIds = pageRows.filter((r) => r.entity_type === "supplier").map((r) => r.id);
    const empIds = pageRows.filter((r) => r.entity_type === "employee").map((r) => r.id);

    const hasDateFilter = Boolean(dateFrom?.trim() || dateTo?.trim());
    const docDateFrom = dateFrom?.trim() ? new Date(`${dateFrom.trim()}T00:00:00.000Z`) : null;
    const docDateTo = dateTo?.trim() ? new Date(`${dateTo.trim()}T23:59:59.999Z`) : null;

    const [
      orderSums,
      paySums,
      periodDocs,
      periodPays,
      supLedger,
      empLedger,
    ] = await Promise.all([
      custIds.length > 0
        ? prisma.financialDocument.groupBy({
            by: ["customerId"],
            where: { customerId: { in: custIds }, category: "הכנסה" },
            _sum: { totalAmount: true },
          })
        : Promise.resolve([]),
      custIds.length > 0
        ? prisma.payment.groupBy({
            by: ["customerId"],
            where: {
              customerId: { in: custIds },
              document: { is: { category: "הכנסה" } },
            },
            _sum: { amount: true },
          })
        : Promise.resolve([]),
      custIds.length > 0
        ? hasDateFilter
          ? prisma.financialDocument.findMany({
              where: {
                customerId: { in: custIds },
                category: "הכנסה",
                OR: [
                  ...(docDateFrom && docDateTo
                    ? [{ docDate: { gte: docDateFrom, lte: docDateTo } }]
                    : docDateFrom
                      ? [{ docDate: { gte: docDateFrom } }]
                      : docDateTo
                        ? [{ docDate: { lte: docDateTo } }]
                        : []),
                  {
                    docDate: null,
                    createdAt: {
                      ...(docDateFrom ? { gte: docDateFrom } : {}),
                      ...(docDateTo ? { lte: docDateTo } : {}),
                    },
                  },
                ],
              },
              select: {
                customerId: true,
                totalAmount: true,
                docDate: true,
                createdAt: true,
              },
            })
          : prisma.financialDocument.findMany({
              where: { customerId: { in: custIds }, category: "הכנסה" },
              select: {
                customerId: true,
                totalAmount: true,
                docDate: true,
                createdAt: true,
              },
            })
        : Promise.resolve([]),
      custIds.length > 0
        ? prisma.payment.findMany({
            where: {
              customerId: { in: custIds },
              document: { is: { category: "הכנסה" } },
              ...(hasDateFilter
                ? {
                    createdAt: {
                      ...(docDateFrom ? { gte: docDateFrom } : {}),
                      ...(docDateTo ? { lte: docDateTo } : {}),
                    },
                  }
                : {}),
            },
            select: { customerId: true, amount: true, createdAt: true },
          })
        : Promise.resolve([]),
      supIds.length > 0
        ? prisma.ledgerEntry.findMany({
            where: { supplierId: { in: supIds } },
            select: { supplierId: true, debit: true, credit: true, entryDate: true },
          })
        : Promise.resolve([]),
      empIds.length > 0
        ? prisma.ledgerEntry.findMany({
            where: { employeeId: { in: empIds } },
            select: { employeeId: true, debit: true, credit: true, entryDate: true },
          })
        : Promise.resolve([]),
    ]);

    const customerTotals = new Map<string, { orders: number; payments: number }>();
    const debitCreditMoves = new Map<string, { debit: number; credit: number; count: number }>();
    for (const id of custIds) {
      customerTotals.set(id, { orders: 0, payments: 0 });
      debitCreditMoves.set(id, { debit: 0, credit: 0, count: 0 });
    }

    for (const g of orderSums) {
      if (!g.customerId) continue;
      const totals = customerTotals.get(g.customerId);
      if (totals) totals.orders += Math.max(0, g._sum.totalAmount ?? 0);
    }
    for (const g of paySums) {
      const totals = customerTotals.get(g.customerId);
      if (totals) totals.payments += Math.max(0, g._sum.amount ?? 0);
    }

    for (const d of periodDocs) {
      if (!d.customerId) continue;
      const entryDate = docEntryDate(d);
      if (!inDateRange(entryDate, dateFrom, dateTo)) continue;
      const row = debitCreditMoves.get(d.customerId);
      if (!row) continue;
      row.debit += Math.max(0, d.totalAmount);
      row.count += 1;
    }

    for (const p of periodPays) {
      if (!inPaymentRange(p.createdAt, dateFrom, dateTo)) continue;
      const row = debitCreditMoves.get(p.customerId);
      if (!row) continue;
      row.credit += p.amount;
      row.count += 1;
    }

    const supAgg = new Map<string, { debit: number; credit: number; count: number; net: number }>();
    for (const id of supIds) {
      supAgg.set(id, { debit: 0, credit: 0, count: 0, net: 0 });
    }
    for (const le of supLedger) {
      if (!le.supplierId) continue;
      const m = supAgg.get(le.supplierId);
      if (!m) continue;
      m.net += le.debit - le.credit;
      if (inLedgerRange(le.entryDate, dateFrom, dateTo)) {
        m.debit += le.debit;
        m.credit += le.credit;
        m.count += 1;
      }
    }

    const empAgg = new Map<string, { debit: number; credit: number; count: number; net: number }>();
    for (const id of empIds) {
      empAgg.set(id, { debit: 0, credit: 0, count: 0, net: 0 });
    }
    for (const le of empLedger) {
      if (!le.employeeId) continue;
      const m = empAgg.get(le.employeeId);
      if (!m) continue;
      m.net += le.debit - le.credit;
      if (inLedgerRange(le.entryDate, dateFrom, dateTo)) {
        m.debit += le.debit;
        m.credit += le.credit;
        m.count += 1;
      }
    }

    const rows: LedgerOverviewRow[] = pageRows.map((e): LedgerOverviewRow => {
      if (e.entity_type === "customer") {
        const totals = customerTotals.get(e.id) ?? { orders: 0, payments: 0 };
        const openBalance = Math.max(0, totals.orders - totals.payments);
        const m = debitCreditMoves.get(e.id) ?? { debit: 0, credit: 0, count: 0 };
        return {
          entity_type: "customer",
          id: e.id,
          name: e.name,
          opening_balance: e.opening_balance,
          open_balance: openBalance,
          total_debit: m.debit,
          total_credit: m.credit,
          movement_count: m.count,
        };
      }
      if (e.entity_type === "supplier") {
        const m = supAgg.get(e.id) ?? { debit: 0, credit: 0, count: 0, net: 0 };
        const openBalance = e.opening_balance + m.net;
        return {
          entity_type: "supplier",
          id: e.id,
          name: e.name,
          opening_balance: e.opening_balance,
          open_balance: Math.max(0, openBalance),
          total_debit: m.debit,
          total_credit: m.credit,
          movement_count: m.count,
        };
      }
      const m = empAgg.get(e.id) ?? { debit: 0, credit: 0, count: 0, net: 0 };
      const openBalance = e.opening_balance + m.net;
      return {
        entity_type: "employee",
        id: e.id,
        name: e.name,
        opening_balance: e.opening_balance,
        open_balance: Math.max(0, openBalance),
        total_debit: m.debit,
        total_credit: m.credit,
        movement_count: m.count,
      };
    });

    return NextResponse.json({
      ok: true,
      counts: {
        customers: customerCount,
        suppliers: supplierCount,
        employees: employeeCount,
      },
      total,
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
