import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { EntityType } from "@/lib/finance/types";
import {
  movementsPayload,
  statementForCustomer,
  statementForEntryEntity,
} from "@/lib/finance/ledger-route-map";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const entityType = req.nextUrl.searchParams.get("entityType") as EntityType | null;
  const entityId = req.nextUrl.searchParams.get("entityId");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");

  if (!entityType || !entityId) {
    return NextResponse.json({ ok: false, error: "entityType ו-entityId נדרשים" }, { status: 400 });
  }

  try {
    if (entityType === "customer") {
      const customer = await prisma.customer.findUnique({ where: { id: entityId } });
      if (!customer) {
        return NextResponse.json({ ok: false, error: "לקוח לא נמצא" }, { status: 404 });
      }
      const [documents, payments] = await Promise.all([
        prisma.financialDocument.findMany({
          where: { customerId: entityId },
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
        }),
        prisma.payment.findMany({
          where: { customerId: entityId },
          select: {
            id: true,
            customerId: true,
            amount: true,
            createdAt: true,
            documentId: true,
            document: { select: { title: true } },
          },
        }),
      ]);
      const statement = statementForCustomer({
        id: customer.id,
        name: customer.name,
        openingBalance: customer.openingBalance,
        documents,
        payments: payments.map((p) => ({
          id: p.id,
          customerId: p.customerId,
          amount: p.amount,
          createdAt: p.createdAt,
          documentId: p.documentId,
          documentTitle: p.document?.title ?? null,
        })),
        dateFrom,
        dateTo,
      });
      return NextResponse.json({ ok: true, ...movementsPayload(statement) });
    }

    if (entityType === "supplier") {
      const supplier = await prisma.supplier.findUnique({ where: { id: entityId } });
      if (!supplier) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
      const entries = await prisma.ledgerEntry.findMany({
        where: { supplierId: entityId },
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
      });
      const statement = statementForEntryEntity({
        entityType: "supplier",
        id: supplier.id,
        name: supplier.name,
        openingBalance: supplier.openingBalance,
        entries,
        dateFrom,
        dateTo,
      });
      return NextResponse.json({ ok: true, ...movementsPayload(statement) });
    }

    const employee = await prisma.employee.findUnique({ where: { id: entityId } });
    if (!employee) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    const entries = await prisma.ledgerEntry.findMany({
      where: { employeeId: entityId },
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
    });
    const statement = statementForEntryEntity({
      entityType: "employee",
      id: employee.id,
      name: employee.name,
      openingBalance: employee.openingBalance,
      entries,
      dateFrom,
      dateTo,
    });
    return NextResponse.json({ ok: true, ...movementsPayload(statement) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
