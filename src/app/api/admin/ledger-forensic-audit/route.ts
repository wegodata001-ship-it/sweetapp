import { NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import { prisma } from "@/lib/prisma";
import {
  authorizeLedgerForensicAudit,
  runLedgerForensicAudit,
  sanitizeLedgerAuditError,
} from "@/lib/finance/ledger-forensic-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookie();
  const auth = authorizeLedgerForensicAudit(session);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, code: auth.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" },
      { status: auth.status },
    );
  }

  const dbErr = await requireDb();
  if (dbErr) {
    return NextResponse.json({ ok: false, code: "LEDGER_AUDIT_FAILED" }, { status: 503 });
  }

  try {
    const [customers, suppliers, employees, documents, payments, ledgerEntries] = await Promise.all([
      prisma.customer.findMany({
        select: { id: true, name: true, phone: true, openingBalance: true },
        orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        select: { id: true, name: true, phone: true, email: true, openingBalance: true },
        orderBy: { name: "asc" },
      }),
      prisma.employee.findMany({
        select: { id: true, name: true, phone: true, openingBalance: true },
        orderBy: { name: "asc" },
      }),
      prisma.financialDocument.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          documentType: true,
          customerId: true,
          supplierId: true,
          employeeId: true,
          totalAmount: true,
          docDate: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        select: {
          id: true,
          customerId: true,
          documentId: true,
          amount: true,
          createdAt: true,
          document: { select: { title: true } },
        },
      }),
      prisma.ledgerEntry.findMany({
        select: {
          id: true,
          debit: true,
          credit: true,
          entryDate: true,
          createdAt: true,
          docType: true,
          description: true,
          financialDocumentId: true,
          supplierId: true,
          employeeId: true,
        },
      }),
    ]);

    const report = runLedgerForensicAudit({
      customers,
      suppliers,
      employees,
      documents,
      payments: payments.map((p) => ({
        id: p.id,
        customerId: p.customerId,
        amount: p.amount,
        createdAt: p.createdAt,
        documentId: p.documentId,
        documentTitle: p.document?.title ?? null,
      })),
      ledgerEntries,
    });

    return NextResponse.json({
      ok: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      summary: {
        customers: {
          total: report.customers.total,
          pass: report.customers.pass,
          fail: report.customers.fail,
        },
        suppliers: {
          total: report.suppliers.total,
          pass: report.suppliers.pass,
          fail: report.suppliers.fail,
        },
        employees: {
          total: report.employees.total,
          pass: report.employees.pass,
          fail: report.employees.fail,
        },
        affectedByOldClamp: report.affectedByOldClamp,
        affectedByOpeningBalance: report.affectedByOpeningBalance,
        affectedByCreditNote: report.affectedByCreditNote,
        duplicates: {
          possible: report.duplicates.possible.length,
          confirmed: report.duplicates.confirmed.length,
          legitimateMultiRole: report.duplicates.legitimateMultiRole.length,
        },
        sourceDataErrors: report.sourceDataErrors,
        codeOnlyErrors: report.codeOnlyErrors,
      },
      coverage: report.coverage,
      details: {
        customers: report.customers.rows,
        suppliers: report.suppliers.rows,
        employees: report.employees.rows,
        orphans: report.orphans,
        duplicates: report.duplicates,
        knownCases: report.knownCases,
        carmelGap: report.carmelGap,
        affectedByDateRange: report.affectedByDateRange,
      },
    });
  } catch (error) {
    console.error("[ledger-forensic-audit]", sanitizeLedgerAuditError(error));
    return NextResponse.json({ ok: false, code: "LEDGER_AUDIT_FAILED" }, { status: 500 });
  }
}
