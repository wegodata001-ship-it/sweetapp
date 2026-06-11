import { prisma } from "@/lib/prisma";
import {
  downloadSourceDocumentFromStorage,
  getSourceDocumentForFinancialDoc,
} from "@/lib/finance/source-documents";
import { parsePayload } from "@/lib/finance/document-payload";

export type DocumentEmailAttachmentKind = "pdf" | "source";

export type DocumentEmailAttachmentSelection = {
  includePdf: boolean;
  includeSource: boolean;
};

export type DocumentAttachmentAvailability = {
  documentId: string;
  hasPdf: boolean;
  hasSource: boolean;
};

export type DocumentEmailAttachmentPreview = {
  documents: DocumentAttachmentAvailability[];
  selectedPdfCount: number;
  selectedSourceCount: number;
  totalFiles: number;
  documentsWithNoFiles: string[];
};

export async function getDocumentAttachmentAvailability(
  documentId: string,
): Promise<DocumentAttachmentAvailability> {
  const [report, doc, upload] = await Promise.all([
    prisma.generatedReport.findFirst({
      where: { relatedId: documentId },
      orderBy: { createdAt: "desc" },
      select: { filePath: true },
    }),
    prisma.financialDocument.findUnique({
      where: { id: documentId },
      select: { pdfStoragePath: true, metadata: true },
    }),
    getSourceDocumentForFinancialDoc(documentId),
  ]);

  const payload = doc?.metadata ? parsePayload(doc.metadata as unknown) : null;
  const payloadSourcePath =
    payload && payload.kind !== "zreport" ? payload.receiptStoragePath?.trim() : "";

  return {
    documentId,
    hasPdf: Boolean(report?.filePath?.trim() || doc?.pdfStoragePath?.trim()),
    hasSource: Boolean(upload?.storagePath?.trim() || payloadSourcePath),
  };
}

export async function previewDocumentEmailAttachments(params: {
  documentIds: string[];
  selection: DocumentEmailAttachmentSelection;
}): Promise<DocumentEmailAttachmentPreview> {
  const uniqueIds = [...new Set(params.documentIds.filter(Boolean))];
  const documents = await Promise.all(uniqueIds.map(getDocumentAttachmentAvailability));

  let selectedPdfCount = 0;
  let selectedSourceCount = 0;
  const documentsWithNoFiles: string[] = [];

  for (const doc of documents) {
    let pdf = params.selection.includePdf && doc.hasPdf;
    let source = params.selection.includeSource && doc.hasSource;

    if (!pdf && !source) {
      if (doc.hasPdf) pdf = true;
      else if (doc.hasSource) source = true;
      else documentsWithNoFiles.push(doc.documentId);
    }

    if (pdf) selectedPdfCount += 1;
    if (source) selectedSourceCount += 1;
  }

  return {
    documents,
    selectedPdfCount,
    selectedSourceCount,
    totalFiles: selectedPdfCount + selectedSourceCount,
    documentsWithNoFiles,
  };
}

export function selectionFromSendMode(
  mode: "pdf_only" | "source_only" | "pdf_and_source",
): DocumentEmailAttachmentSelection {
  switch (mode) {
    case "pdf_only":
      return { includePdf: true, includeSource: false };
    case "source_only":
      return { includePdf: false, includeSource: true };
    default:
      return { includePdf: true, includeSource: true };
  }
}

export function sendModeFromSelection(
  selection: DocumentEmailAttachmentSelection,
): "pdf_only" | "source_only" | "pdf_and_source" {
  if (selection.includePdf && selection.includeSource) return "pdf_and_source";
  if (selection.includeSource) return "source_only";
  return "pdf_only";
}
