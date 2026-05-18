import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { EntityType, LedgerMovementView } from "@/lib/finance/types";

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

      const docs = await prisma.financialDocument.findMany({
        where: { customerId: entityId },
        orderBy: [{ docDate: "asc" }, { createdAt: "asc" }],
      });

      const payments = await prisma.payment.findMany({
        where: {
          customerId: entityId,
          document: { is: { category: "הכנסה" } },
        },
        include: { document: { select: { id: true, title: true } } },
        orderBy: { createdAt: "asc" },
      });

      const movements: LedgerMovementView[] = [];
      const paymentsByDocument = new Map<string, number>();
      for (const payment of payments) {
        if (!payment.documentId) continue;
        paymentsByDocument.set(
          payment.documentId,
          (paymentsByDocument.get(payment.documentId) ?? 0) + Math.max(0, payment.amount),
        );
      }

      for (const d of docs) {
        if (d.category !== "הכנסה") continue;
        const entryDate = (d.docDate ?? d.createdAt).toISOString().slice(0, 10);
        if (dateFrom && entryDate < dateFrom) continue;
        if (dateTo && entryDate > dateTo) continue;
        const paidForDocument = paymentsByDocument.get(d.id) ?? 0;
        const remainingAmount = Math.max(0, d.totalAmount - paidForDocument);

        movements.push({
          id: `doc-${d.id}`,
          document_id: d.id,
          entity_id: entityId,
          entity_name: customer.name,
          entity_type: "customer",
          entry_date: entryDate,
          doc_type: d.documentType,
          description:
            remainingAmount > 1e-6
              ? `${d.title} — חובה פתוחה ${remainingAmount.toFixed(2)} ₪`
              : `${d.title} — שולם במלואו`,
          debit: d.totalAmount,
          credit: 0,
          open_balance: remainingAmount,
        });
      }

      for (const p of payments) {
        const entryDate = p.createdAt.toISOString().slice(0, 10);
        if (dateFrom && entryDate < dateFrom) continue;
        if (dateTo && entryDate > dateTo) continue;
        const note = p.document?.title ? ` — ${p.document.title}` : "";
        movements.push({
          id: `pay-${p.id}`,
          document_id: p.document?.id ?? null,
          entity_id: entityId,
          entity_name: customer.name,
          entity_type: "customer",
          entry_date: entryDate,
          doc_type: "תשלום",
          description: `תשלום${note}`,
          debit: 0,
          credit: p.amount,
          open_balance: 0,
        });
      }

      movements.sort((a, b) => a.entry_date.localeCompare(b.entry_date));

      const totalOrders = docs.reduce(
        (sum, doc) => sum + (doc.category === "הכנסה" ? Math.max(0, doc.totalAmount) : 0),
        0,
      );
      const totalCredit = payments.reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
      const openDebt = Math.max(0, totalOrders - totalCredit);

      return NextResponse.json({
        ok: true,
        opening: 0,
        entityName: customer.name,
        openDebt,
        totalCredit,
        balance: openDebt,
        movements,
      });
    }

    if (entityType === "supplier") {
      const supplier = await prisma.supplier.findUnique({ where: { id: entityId } });
      if (!supplier) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

      const rows = await prisma.ledgerEntry.findMany({
        where: { supplierId: entityId },
        orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      });
      let movements = rows.map(
        (r): LedgerMovementView => ({
          id: r.id,
          entity_id: entityId,
          entity_name: supplier.name,
          entity_type: "supplier",
          entry_date: r.entryDate.toISOString().slice(0, 10),
          doc_type: r.docType,
          description: r.description,
          debit: r.debit,
          credit: r.credit,
        }),
      );
      if (dateFrom) movements = movements.filter((m) => m.entry_date >= dateFrom);
      if (dateTo) movements = movements.filter((m) => m.entry_date <= dateTo);

      return NextResponse.json({
        ok: true,
        opening: supplier.openingBalance,
        entityName: supplier.name,
        movements,
      });
    }

    const employee = await prisma.employee.findUnique({ where: { id: entityId } });
    if (!employee) return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });

    let movements: LedgerMovementView[] = (
      await prisma.ledgerEntry.findMany({
        where: { employeeId: entityId },
        orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
      })
    ).map(
      (r): LedgerMovementView => ({
        id: r.id,
        entity_id: entityId,
        entity_name: employee.name,
        entity_type: "employee",
        entry_date: r.entryDate.toISOString().slice(0, 10),
        doc_type: r.docType,
        description: r.description,
        debit: r.debit,
        credit: r.credit,
      }),
    );
    if (dateFrom) movements = movements.filter((m) => m.entry_date >= dateFrom);
    if (dateTo) movements = movements.filter((m) => m.entry_date <= dateTo);

    return NextResponse.json({
      ok: true,
      opening: employee.openingBalance,
      entityName: employee.name,
      movements,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
