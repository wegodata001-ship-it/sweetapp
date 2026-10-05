import { Prisma } from "@prisma/client";
import { resolveDocumentNotes } from "@/lib/finance/document-business-date";
import { prisma } from "@/lib/prisma";
import type { FinanceDocumentRow } from "@/lib/finance/types";

/** First paint: enough rows for the viewport, not the whole archive. */
export const ARCHIVE_INITIAL_TAKE = 30;

export const financialDocumentListSelect = {
  id: true,
  title: true,
  category: true,
  documentType: true,
  customerId: true,
  supplierId: true,
  employeeId: true,
  totalAmount: true,
  paidAmount: true,
  remainingAmount: true,
  paymentStatus: true,
  notes: true,
  pdfStoragePath: true,
  sentToCpa: true,
  sentToCpaAt: true,
  sentToCpaEmail: true,
  docDate: true,
  createdAt: true,
  depositAmount: true,
  depositType: true,
  depositNote: true,
  depositStatus: true,
  customer: { select: { name: true } },
  supplier: { select: { name: true } },
  employee: { select: { name: true } },
  sourceDocument: { select: { id: true, fileName: true, fileType: true, mimeType: true } },
  sentToCpaBy: { select: { id: true, fullName: true } },
} satisfies Prisma.FinancialDocumentSelect;

export type FinancialDocumentListRow = Prisma.FinancialDocumentGetPayload<{
  select: typeof financialDocumentListSelect;
}>;

/** List row for the archive table — no metadata JSON, no payments join. */
export function prismaDocToArchiveListRow(row: FinancialDocumentListRow): FinanceDocumentRow {
  const paidAmount = row.documentType === "דוח Z" ? row.totalAmount : row.paidAmount;
  const remainingAmount = Math.max(0, row.totalAmount - paidAmount);
  const paymentStatus =
    row.totalAmount <= 0 ? "unpaid" : remainingAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    document_type: row.documentType,
    customer_id: row.customerId,
    customer_name: row.customer?.name ?? null,
    total_amount: row.totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    payment_status: paymentStatus,
    deposit_amount: row.depositAmount,
    deposit_type: row.depositType,
    deposit_note: row.depositNote,
    deposit_status: row.depositStatus,
    doc_date: row.docDate ? row.docDate.toISOString().slice(0, 10) : null,
    notes: resolveDocumentNotes("", row.notes) || null,
    pdf_storage_path: row.pdfStoragePath,
    sent_to_cpa: row.sentToCpa,
    sent_to_cpa_at: row.sentToCpaAt ? row.sentToCpaAt.toISOString() : null,
    sent_to_cpa_email: row.sentToCpaEmail ?? null,
    sent_to_cpa_by: row.sentToCpaBy
      ? { id: row.sentToCpaBy.id, full_name: row.sentToCpaBy.fullName }
      : null,
    created_at: row.createdAt.toISOString(),
    payload: null,
    supplier_id: row.supplierId ?? null,
    supplier_name: row.supplier?.name ?? null,
    employee_id: row.employeeId ?? null,
    employee_name: row.employee?.name ?? null,
    source_file: row.sourceDocument?.id
      ? {
          file_name: row.sourceDocument.fileName,
          file_type: row.sourceDocument.fileType ?? row.sourceDocument.mimeType ?? null,
          linked: true,
        }
      : null,
  };
}

type ArchiveSqlRow = {
  id: string;
  title: string;
  category: string;
  documentType: string;
  customerId: string | null;
  supplierId: string | null;
  employeeId: string | null;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  notes: string | null;
  pdfStoragePath: string | null;
  sentToCpa: boolean;
  sentToCpaAt: Date | null;
  sentToCpaEmail: string | null;
  docDate: Date | null;
  createdAt: Date;
  depositAmount: number;
  depositType: string | null;
  depositNote: string | null;
  depositStatus: string | null;
  customer_name: string | null;
  supplier_name: string | null;
  employee_name: string | null;
  sent_by_id: string | null;
  sent_by_name: string | null;
  source_id: string | null;
  source_file_name: string | null;
  source_file_type: string | null;
  source_mime: string | null;
};

export function archiveListWhereSql(searchParams: URLSearchParams): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const accountant = searchParams.get("accountant");
  if (accountant === "sent") parts.push(Prisma.sql`d."sentToCpa" = true`);
  else if (accountant === "not_sent") parts.push(Prisma.sql`d."sentToCpa" = false`);

  const category = searchParams.get("category")?.trim() ?? "";
  if (category) parts.push(Prisma.sql`d.category = ${category}`);

  if (searchParams.get("invoices") === "1") {
    parts.push(
      Prisma.sql`(d."documentType" = ${"חשבונית"} OR d."documentType" LIKE ${"חשבונית %"} OR d."documentType" LIKE ${"חשבונית/%"})`,
    );
  }

  const kind = searchParams.get("kind")?.trim() ?? "";
  const partyId = searchParams.get("partyId")?.trim() ?? "";
  if (kind === "customer") {
    parts.push(partyId ? Prisma.sql`d."customerId" = ${partyId}` : Prisma.sql`d."customerId" IS NOT NULL AND d."supplierId" IS NULL AND d."employeeId" IS NULL`);
  } else if (kind === "supplier") {
    parts.push(partyId ? Prisma.sql`d."supplierId" = ${partyId}` : Prisma.sql`d."supplierId" IS NOT NULL`);
  } else if (kind === "employee") {
    parts.push(partyId ? Prisma.sql`d."employeeId" = ${partyId}` : Prisma.sql`d."employeeId" IS NOT NULL AND d."supplierId" IS NULL`);
  }

  const q = searchParams.get("q")?.trim() ?? "";
  if (q) {
    const like = `%${q}%`;
    parts.push(Prisma.sql`(
      d.title ILIKE ${like}
      OR d."documentType" ILIKE ${like}
      OR d.category ILIKE ${like}
      OR c.name ILIKE ${like}
      OR s.name ILIKE ${like}
      OR e.name ILIKE ${like}
    )`);
  }

  return parts.length ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.sql``;
}

export function sqlRowToArchiveListRow(row: ArchiveSqlRow): FinanceDocumentRow {
  return prismaDocToArchiveListRow({
    id: row.id,
    title: row.title,
    category: row.category,
    documentType: row.documentType,
    customerId: row.customerId,
    supplierId: row.supplierId,
    employeeId: row.employeeId,
    totalAmount: Number(row.totalAmount),
    paidAmount: Number(row.paidAmount),
    remainingAmount: Number(row.remainingAmount),
    paymentStatus: row.paymentStatus,
    notes: row.notes,
    pdfStoragePath: row.pdfStoragePath,
    sentToCpa: row.sentToCpa,
    sentToCpaAt: row.sentToCpaAt,
    sentToCpaEmail: row.sentToCpaEmail,
    docDate: row.docDate,
    createdAt: row.createdAt,
    depositAmount: Number(row.depositAmount),
    depositType: row.depositType,
    depositNote: row.depositNote,
    depositStatus: row.depositStatus ?? "open",
    customer: row.customer_name ? { name: row.customer_name } : null,
    supplier: row.supplier_name ? { name: row.supplier_name } : null,
    employee: row.employee_name ? { name: row.employee_name } : null,
    sourceDocument: row.source_id
      ? {
          id: row.source_id,
          fileName: row.source_file_name ?? "document",
          fileType: row.source_file_type,
          mimeType: row.source_mime,
        }
      : null,
    sentToCpaBy: row.sent_by_id && row.sent_by_name ? { id: row.sent_by_id, fullName: row.sent_by_name } : null,
  });
}

/** One SQL: displayed columns + name joins. No metadata JSON. */
export async function loadArchiveDocumentPage(searchParams: URLSearchParams, take: number, skip: number) {
  const whereSql = archiveListWhereSql(searchParams);
  const limit = take + 1;
  const rows = await prisma.$queryRaw<ArchiveSqlRow[]>`
    SELECT
      d.id, d.title, d.category, d."documentType",
      d."customerId", d."supplierId", d."employeeId",
      d."totalAmount", d."paidAmount", d."remainingAmount", d."paymentStatus",
      d.notes, d."pdfStoragePath",
      d."sentToCpa", d."sentToCpaAt", d."sentToCpaEmail",
      d."docDate", d."createdAt",
      d."depositAmount", d."depositType", d."depositNote", d."depositStatus",
      c.name AS customer_name,
      s.name AS supplier_name,
      e.name AS employee_name,
      u.id AS sent_by_id,
      u."fullName" AS sent_by_name,
      du.id AS source_id,
      du."fileName" AS source_file_name,
      du."fileType" AS source_file_type,
      du."mimeType" AS source_mime
    FROM "FinancialDocument" d
    LEFT JOIN "Customer" c ON c.id = d."customerId"
    LEFT JOIN "Supplier" s ON s.id = d."supplierId"
    LEFT JOIN "Employee" e ON e.id = d."employeeId"
    LEFT JOIN "User" u ON u.id = d."sentToCpaById"
    LEFT JOIN documents du ON du."financialDocumentId" = d.id
    ${whereSql}
    ORDER BY d."createdAt" DESC
    LIMIT ${limit} OFFSET ${skip}
  `;
  const hasMore = rows.length > take;
  return { rows: rows.slice(0, take).map(sqlRowToArchiveListRow), hasMore };
}
