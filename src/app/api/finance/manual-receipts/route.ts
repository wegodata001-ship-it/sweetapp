import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { EXPENSE_TYPE_VALUES } from "@/lib/finance/expense-types";
import { PAYMENT_INSTRUMENT_OPTIONS } from "@/lib/finance/document-payload";
import {
  incomeExpenseVatTotal,
  parsePayload,
} from "@/lib/finance/document-payload";
import {
  MANUAL_DOCUMENT_TYPES,
  MANUAL_VAT_MODES,
  addMoney,
  computeManualReceiptVat,
  createsExpenseMovement,
  inputVatFromReceipts,
  subtractMoney,
  type ManualVatMode,
} from "@/lib/finance/manual-receipt-vat";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EXPENSE_CATEGORY = "הוצאה";
const INCOME_CATEGORY = "הכנסה";

function money(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export function auditSnapshot(row: {
  documentDate: Date;
  documentNumber: string | null;
  supplierName: string;
  supplierTaxId: string | null;
  documentType: string;
  category: string | null;
  description: string | null;
  amountBeforeVat: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  vatMode: string;
  vatDeductible: boolean;
  vatDeductibleAmount: Prisma.Decimal;
  paymentMethod: string | null;
  attachmentName: string | null;
  linkedFinancialDocumentId: string | null;
}) {
  return {
    documentDate: row.documentDate.toISOString().slice(0, 10),
    documentNumber: row.documentNumber,
    supplierName: row.supplierName,
    supplierTaxId: row.supplierTaxId,
    documentType: row.documentType,
    category: row.category,
    description: row.description,
    amountBeforeVat: money(row.amountBeforeVat),
    vatRate: new Prisma.Decimal(row.vatRate).toFixed(4),
    vatAmount: money(row.vatAmount),
    totalAmount: money(row.totalAmount),
    vatMode: row.vatMode,
    vatDeductible: row.vatDeductible ? "yes" : "no",
    vatDeductibleAmount: money(row.vatDeductibleAmount),
    paymentMethod: row.paymentMethod,
    attachmentName: row.attachmentName,
    linkedFinancialDocumentId: row.linkedFinancialDocumentId,
  };
}

export async function writeAudit(
  userId: string,
  action: "manual_receipt_create" | "manual_receipt_update" | "manual_receipt_delete",
  receiptId: string,
  before: Record<string, string | null> | null,
  after: Record<string, string | null> | null,
) {
  const changes: Array<{ field: string; before: string | null; after: string | null }> = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const field of keys) {
    const prev = before?.[field] ?? null;
    const next = after?.[field] ?? null;
    if (prev !== next) changes.push({ field, before: prev, after: next });
  }
  await logActivity(
    userId,
    `${action} ${JSON.stringify({ receiptId, changes })}`,
  );
}

type Body = {
  documentDate?: string;
  documentNumber?: string;
  supplierName?: string;
  supplierTaxId?: string;
  documentType?: string;
  category?: string;
  description?: string;
  enteredAmount?: string;
  vatMode?: string;
  vatDeductible?: boolean;
  paymentMethod?: string;
  attachmentUrl?: string | null;
  attachmentPath?: string | null;
  attachmentBucket?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  linkedFinancialDocumentId?: string | null;
};

export function parseBody(body: Body) {
  const documentDate = body.documentDate?.trim() ?? "";
  const supplierName = body.supplierName?.trim() ?? "";
  const documentType = body.documentType?.trim() ?? "";
  const vatMode = body.vatMode?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    return { error: "תאריך מסמך חובה" as const };
  }
  if (!supplierName) return { error: "שם ספק חובה" as const };
  if (!MANUAL_DOCUMENT_TYPES.includes(documentType as (typeof MANUAL_DOCUMENT_TYPES)[number])) {
    return { error: "סוג מסמך לא תקין" as const };
  }
  if (!MANUAL_VAT_MODES.includes(vatMode as ManualVatMode)) {
    return { error: "מצב מע״מ לא תקין" as const };
  }
  const category = body.category?.trim() || null;
  if (category && !EXPENSE_TYPE_VALUES.includes(category as (typeof EXPENSE_TYPE_VALUES)[number])) {
    return { error: "קטגוריה לא תקינה" as const };
  }
  const paymentMethod = body.paymentMethod?.trim() || null;
  if (
    paymentMethod &&
    !PAYMENT_INSTRUMENT_OPTIONS.includes(paymentMethod as (typeof PAYMENT_INSTRUMENT_OPTIONS)[number])
  ) {
    return { error: "אמצעי תשלום לא תקין" as const };
  }
  const computed = computeManualReceiptVat({
    enteredAmount: body.enteredAmount ?? "",
    mode: vatMode as ManualVatMode,
    vatDeductible: Boolean(body.vatDeductible),
  });
  if (!computed) return { error: "סכום לא תקין" as const };
  if (createsExpenseMovement()) return { error: "מסמך ידני לא יוצר הוצאה" as const };
  return {
    data: {
      documentDate: new Date(`${documentDate}T00:00:00.000Z`),
      documentNumber: body.documentNumber?.trim() || null,
      supplierName,
      supplierTaxId: body.supplierTaxId?.trim() || null,
      documentType,
      category,
      description: body.description?.trim() || null,
      amountBeforeVat: computed.amountBeforeVat,
      vatRate: computed.vatRate,
      vatAmount: computed.vatAmount,
      totalAmount: computed.totalAmount,
      vatMode,
      vatDeductible: Boolean(body.vatDeductible),
      vatDeductibleAmount: computed.vatDeductibleAmount,
      paymentMethod,
      attachmentUrl: body.attachmentUrl?.trim() || null,
      attachmentPath: body.attachmentPath?.trim() || null,
      attachmentBucket: body.attachmentBucket?.trim() || null,
      attachmentMime: body.attachmentMime?.trim() || null,
      attachmentName: body.attachmentName?.trim() || null,
      linkedFinancialDocumentId: body.linkedFinancialDocumentId?.trim() || null,
    },
  };
}

export async function assertExpenseLink(id: string | null, currentReceiptId?: string) {
  if (!id) return null;
  const doc = await prisma.financialDocument.findUnique({
    where: { id },
    select: { id: true, category: true },
  });
  if (!doc || doc.category !== EXPENSE_CATEGORY) {
    return "אפשר לקשר רק להוצאה קיימת";
  }
  const taken = await prisma.manualReceipt.findUnique({
    where: { linkedFinancialDocumentId: id },
    select: { id: true },
  });
  if (taken && taken.id !== currentReceiptId) {
    return "ההוצאה כבר מקושרת לקבלה ידנית";
  }
  return null;
}

export function serialize(row: {
  id: string;
  documentDate: Date;
  documentNumber: string | null;
  supplierName: string;
  supplierTaxId: string | null;
  documentType: string;
  category: string | null;
  description: string | null;
  amountBeforeVat: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  vatMode: string;
  vatDeductible: boolean;
  vatDeductibleAmount: Prisma.Decimal;
  paymentMethod: string | null;
  attachmentUrl: string | null;
  attachmentPath: string | null;
  attachmentBucket: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  linkedFinancialDocumentId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    documentDate: row.documentDate.toISOString().slice(0, 10),
    documentNumber: row.documentNumber,
    supplierName: row.supplierName,
    supplierTaxId: row.supplierTaxId,
    documentType: row.documentType,
    category: row.category,
    description: row.description,
    amountBeforeVat: money(row.amountBeforeVat),
    vatRate: new Prisma.Decimal(row.vatRate).toFixed(4),
    vatAmount: money(row.vatAmount),
    totalAmount: money(row.totalAmount),
    vatMode: row.vatMode,
    vatDeductible: row.vatDeductible,
    vatDeductibleAmount: money(row.vatDeductibleAmount),
    paymentMethod: row.paymentMethod,
    attachmentUrl: row.attachmentUrl,
    attachmentPath: row.attachmentPath,
    attachmentBucket: row.attachmentBucket,
    attachmentMime: row.attachmentMime,
    attachmentName: row.attachmentName,
    linkedFinancialDocumentId: row.linkedFinancialDocumentId,
    createdBy: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();
  const supplier = sp.get("supplier")?.trim();
  const category = sp.get("category")?.trim();
  const documentType = sp.get("documentType")?.trim();
  const deductible = sp.get("vatDeductible")?.trim();

  const where: Prisma.ManualReceiptWhereInput = {};
  if (from || to) {
    where.documentDate = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) where.documentDate.gte = new Date(`${from}T00:00:00.000Z`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) where.documentDate.lte = new Date(`${to}T00:00:00.000Z`);
  }
  if (supplier) where.supplierName = { contains: supplier, mode: "insensitive" };
  if (category) where.category = category;
  if (documentType) where.documentType = documentType;
  if (deductible === "yes") where.vatDeductible = true;
  if (deductible === "no") where.vatDeductible = false;

  const [rows, expenses, incomeDocs] = await Promise.all([
    prisma.manualReceipt.findMany({ where, orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }] }),
    prisma.financialDocument.findMany({
      where: { category: EXPENSE_CATEGORY },
      select: { id: true, title: true, docDate: true, totalAmount: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.financialDocument.findMany({
      where: {
        category: INCOME_CATEGORY,
        ...(from || to
          ? {
              docDate: {
                ...(from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
      },
      select: { metadata: true },
    }),
  ]);

  const data = rows.map(serialize);
  const summary = data.reduce(
    (acc, row) => ({
      count: acc.count + 1,
      beforeVat: addMoney(acc.beforeVat, row.amountBeforeVat),
      vat: addMoney(acc.vat, row.vatAmount),
      total: addMoney(acc.total, row.totalAmount),
      deductibleVat: addMoney(acc.deductibleVat, row.vatDeductibleAmount),
    }),
    { count: 0, beforeVat: "0.00", vat: "0.00", total: "0.00", deductibleVat: "0.00" },
  );

  let outputVat = "0.00";
  for (const doc of incomeDocs) {
    const payload = parsePayload(doc.metadata);
    if (payload?.kind === "income") {
      outputVat = addMoney(
        outputVat,
        new Prisma.Decimal(incomeExpenseVatTotal(payload)).toDecimalPlaces(2).toFixed(2),
      );
    }
  }
  const inputVat = inputVatFromReceipts(data);
  const vatPayable = subtractMoney(outputVat, inputVat);

  return NextResponse.json({
    ok: true,
    data,
    summary,
    vatReport: {
      outputVat,
      inputVat,
      vatPayable,
    },
    linkableExpenses: expenses.map((row) => ({
      id: row.id,
      title: row.title,
      docDate: row.docDate ? row.docDate.toISOString().slice(0, 10) : null,
      totalAmount: money(row.totalAmount),
    })),
  });
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const parsed = parseBody((await req.json()) as Body);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const linkError = await assertExpenseLink(parsed.data.linkedFinancialDocumentId);
  if (linkError) return NextResponse.json({ ok: false, error: linkError }, { status: 400 });

  const created = await prisma.manualReceipt.create({
    data: { ...parsed.data, createdById: session.sub },
  });
  await writeAudit(session.sub, "manual_receipt_create", created.id, null, auditSnapshot(created));
  return NextResponse.json({ ok: true, data: serialize(created) });
}
