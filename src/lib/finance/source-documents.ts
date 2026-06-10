import type { IncomeExpensePayload } from "@/lib/finance/document-payload";
import { prisma } from "@/lib/prisma";
import { businessDocumentsBucket, tenantStorageId } from "@/lib/storage/business-documents";
import { resolveSourceFilesBucket } from "@/lib/storage/buckets";

export type SourceDocumentType = "income" | "expense" | "z_report";

type SourceDocumentPayload = Pick<
  IncomeExpensePayload,
  | "receiptFileName"
  | "receiptStoragePath"
  | "receiptStorageBucket"
  | "receiptMimeType"
>;

export async function archiveSourceDocumentForFinancialDoc(params: {
  financialDocumentId: string;
  documentType: SourceDocumentType;
  payload: SourceDocumentPayload;
  uploadedById?: string | null;
}): Promise<void> {
  const fileName = params.payload.receiptFileName?.trim();
  const storagePath = params.payload.receiptStoragePath?.trim();
  if (!fileName || !storagePath) return;

  const storageBucket = resolveSourceFilesBucket(
    params.payload.receiptStorageBucket?.trim() || businessDocumentsBucket(),
  );
  const fileType = params.payload.receiptMimeType?.trim() || null;

  await prisma.documentUpload.upsert({
    where: { financialDocumentId: params.financialDocumentId },
    create: {
      tenantId: tenantStorageId(),
      documentType: params.documentType,
      fileName,
      storageBucket,
      storagePath,
      fileType,
      mimeType: fileType,
      publicUrl: null,
      uploadedById: params.uploadedById ?? null,
      financialDocumentId: params.financialDocumentId,
    },
    update: {
      documentType: params.documentType,
      fileName,
      storageBucket,
      storagePath,
      fileType,
      mimeType: fileType,
      publicUrl: null,
      uploadedAt: new Date(),
      uploadedById: params.uploadedById ?? null,
    },
  });
}

export async function getSourceDocumentForFinancialDoc(financialDocumentId: string) {
  return prisma.documentUpload.findUnique({
    where: { financialDocumentId },
  });
}
