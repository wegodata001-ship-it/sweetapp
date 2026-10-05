import { NextRequest, NextResponse } from "next/server";
import {
  buildItemsFromIncomeExpense,
  incomeExpenseDepositAmount,
  incomeExpenseGrandTotal,
  isWorkerExpensePayload,
  paymentLinesTotal,
  workerPayAmountNum,
  type FinanceDocumentPayload,
  type IncomeExpensePayload,
  type ZReportPayload,
} from "@/lib/finance/document-payload";
import { ARCHIVE_INITIAL_TAKE, loadArchiveDocumentPage } from "@/lib/finance/archive-list-query";
import { saveProductHistoryFromItems, syncCheckPaymentsForDocument } from "@/lib/finance/document-side-effects";
import { documentTypeForEmployeePay, normalizeEmployeePayType } from "@/lib/finance/employee-pay-types";
import { resolveExpenseDocumentLinks } from "@/lib/finance/expense-ledger-sync";
import { normalizeExpenseType } from "@/lib/finance/expense-types";
import { SupplierNameRequiredError, isDatabaseSaveError } from "@/lib/finance/supplier-resolve";
import {
  persistIncomeExpenseDocument,
  persistZDocumentCreate,
  resolveSupplierForPersist,
} from "@/lib/finance/persist-document-create";
import { recordSupplierPriceHistoryFromExpense } from "@/lib/procurement/record-expense-prices";
import { resolveWrittenDocDate } from "@/lib/finance/document-business-date";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { notifyAbnormalExpenseIfNeeded } from "@/lib/notifications/notifyAbnormalExpense";
import { invalidateDashboardCaches } from "@/lib/dashboard/invalidate";
import { archiveSourceDocumentForFinancialDoc } from "@/lib/finance/source-documents";
import { getAccountantRecipientEmail } from "@/lib/finance/accountant-config";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function documentsListWhere(searchParams: URLSearchParams): Prisma.FinancialDocumentWhereInput {
  const and: Prisma.FinancialDocumentWhereInput[] = [];
  const accountant = searchParams.get("accountant");
  if (accountant === "sent") and.push({ sentToCpa: true });
  else if (accountant === "not_sent") and.push({ sentToCpa: false });

  const category = searchParams.get("category")?.trim() ?? "";
  if (category) and.push({ category });

  if (searchParams.get("invoices") === "1") {
    and.push({
      OR: [
        { documentType: "חשבונית" },
        { documentType: { startsWith: "חשבונית " } },
        { documentType: { startsWith: "חשבונית/" } },
      ],
    });
  }

  const kind = searchParams.get("kind")?.trim() ?? "";
  const partyId = searchParams.get("partyId")?.trim() ?? "";
  if (kind === "customer") {
    and.push(partyId ? { customerId: partyId } : { customerId: { not: null }, supplierId: null, employeeId: null });
  } else if (kind === "supplier") {
    and.push(partyId ? { supplierId: partyId } : { supplierId: { not: null } });
  } else if (kind === "employee") {
    and.push(partyId ? { employeeId: partyId } : { employeeId: { not: null }, supplierId: null });
  }

  const q = searchParams.get("q")?.trim() ?? "";
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { documentType: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
        { supplier: { is: { name: { contains: q, mode: "insensitive" } } } },
        { employee: { is: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  try {
    const { searchParams } = req.nextUrl;
    const where = documentsListWhere(searchParams);
    const takeRaw = Number(searchParams.get("take") ?? String(ARCHIVE_INITIAL_TAKE));
    const pageRaw = Number(searchParams.get("page") ?? "1");
    const take = Number.isFinite(takeRaw)
      ? Math.min(100, Math.max(1, Math.floor(takeRaw)))
      : ARCHIVE_INITIAL_TAKE;
    const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
    const skip = (page - 1) * take;
    const idsOnly = searchParams.get("idsOnly") === "1";

    if (idsOnly) {
      const ids = await prisma.financialDocument.findMany({
        where,
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({
        ok: true,
        data: ids,
        hasMore: false,
        accountantRecipientEmail: getAccountantRecipientEmail(),
      });
    }

    const queryStarted = performance.now();
    const { rows: data, hasMore } = await loadArchiveDocumentPage(searchParams, take, skip);
    const queryMs = Math.round(performance.now() - queryStarted);

    return NextResponse.json(
      {
        ok: true,
        data,
        hasMore,
        page,
        take,
        accountantRecipientEmail: getAccountantRecipientEmail(),
      },
      { headers: { "Server-Timing": `db;dur=${queryMs}` } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

function zTotal(z: ZReportPayload): number {
  return z.cashTaxable + z.cashExempt + z.creditTaxable + z.creditExempt + z.transfers;
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  try {
    const body = (await req.json()) as {
      title: string;
      category: string;
      docDate: string | null;
      payload: FinanceDocumentPayload;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ ok: false, error: "חסר כותרת" }, { status: 400 });
    }

    const meta = body.payload;
    if (!meta) {
      return NextResponse.json({ ok: false, error: "חסר payload" }, { status: 400 });
    }

    if (meta.kind === "zreport") {
      const z = meta;
      const doc = await persistZDocumentCreate({
        title: body.title.trim(),
        category: body.category,
        total: zTotal(z),
        z,
        docDate: resolveWrittenDocDate(z.zDate, body.docDate),
      });
      if (session) void logActivity(session.sub, "document_create");
      await archiveSourceDocumentForFinancialDoc({
        financialDocumentId: doc.id,
        documentType: "z_report",
        payload: z,
        uploadedById: session?.sub ?? null,
      });
      invalidateDashboardCaches();
      return NextResponse.json({ ok: true, id: doc.id });
    }

    const ie = meta as IncomeExpensePayload;
    if (isWorkerExpensePayload(ie)) {
      if (!ie.employeeId?.trim()) {
        return NextResponse.json({ ok: false, error: "יש לבחור עובד" }, { status: 400 });
      }
      if (workerPayAmountNum(ie) < 1e-6) {
        return NextResponse.json({ ok: false, error: "יש להזין סכום לתשלום" }, { status: 400 });
      }
    }
    const items = buildItemsFromIncomeExpense(ie);
    const productTotal =
      items.reduce((s, r) => s + r.total, 0) || incomeExpenseGrandTotal(ie);
    const depositAmount = incomeExpenseDepositAmount(ie);
    const calculatedTotal = productTotal + depositAmount;

    const isIncomeExpenseDocument = ie.kind === "income" || ie.kind === "expense";
    const paidRaw = paymentLinesTotal(ie);

    if (isIncomeExpenseDocument) {
      if (paidRaw < -1e-6) {
        return NextResponse.json({ ok: false, error: "סכום תשלום לא יכול להיות שלילי" }, { status: 400 });
      }
      if (paidRaw > calculatedTotal + 1e-6) {
        return NextResponse.json(
          { ok: false, error: "סכום אמצעי התשלום לא יכול לעלות על סה״כ המסמך" },
          { status: 400 },
        );
      }
    }

    const expenseLinks = ie.kind === "expense" ? resolveExpenseDocumentLinks(ie) : { supplierId: null, employeeId: null };
    const docType =
      ie.kind === "expense" && normalizeExpenseType(ie.expenseType) === "WORKER_PAYMENTS"
        ? documentTypeForEmployeePay(normalizeEmployeePayType(ie.employeePayType))
        : ie.documentType;

    let supplierId = expenseLinks.supplierId;
    let supplierName = ie.kind === "expense" ? ie.counterpartyName : null;
    let createSupplier = false;
    if (ie.kind === "expense") {
      const resolved = await resolveSupplierForPersist({
        expenseType: ie.expenseType,
        supplierId: ie.supplierId,
        supplierName: ie.counterpartyName,
      });
      if (resolved) {
        supplierId = resolved.id;
        supplierName = resolved.name;
        createSupplier = resolved.create;
        ie.supplierId = resolved.id;
        ie.counterpartyName = resolved.name;
      }
    }

    const doc = await persistIncomeExpenseDocument({
      title: body.title.trim(),
      category: body.category,
      documentType: docType,
      ie,
      items,
      productTotal,
      depositAmount,
      calculatedTotal,
      docDate: resolveWrittenDocDate(ie.docDate, body.docDate),
      customerName: ie.kind === "income" ? ie.counterpartyName.trim() || null : null,
      supplierId,
      supplierName,
      createSupplier,
      employeeId: expenseLinks.employeeId,
    });

    void saveProductHistoryFromItems(items);
    if (body.category === "הוצאה" && ie.kind === "expense") {
      void recordSupplierPriceHistoryFromExpense(ie);
    }
    const hasCheckLine = (ie.payments ?? []).some((p) => p.instrument === "CHECK" && p.check);
    if (hasCheckLine) {
      await syncCheckPaymentsForDocument(doc.id);
    }
    if (session) void logActivity(session.sub, "document_create");
    if (body.category === "הוצאה" && ie.kind === "expense") {
      void notifyAbnormalExpenseIfNeeded({
        documentId: doc.id,
        totalAmount: calculatedTotal,
        supplierId: doc.supplierId,
        title: body.title.trim(),
      });
    }
    if (ie.kind === "income" || ie.kind === "expense") {
      await archiveSourceDocumentForFinancialDoc({
        financialDocumentId: doc.id,
        documentType: ie.kind,
        payload: ie,
        uploadedById: session?.sub ?? null,
      });
    }
    invalidateDashboardCaches();
    return NextResponse.json({ ok: true, id: doc.id });
  } catch (e) {
    if (e instanceof SupplierNameRequiredError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    if (isDatabaseSaveError(e)) {
      console.error("document save failed");
      return NextResponse.json({ ok: false, error: "לא נשמר המסמך" }, { status: 500 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
