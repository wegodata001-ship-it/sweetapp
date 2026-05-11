import { prisma } from "@/lib/prisma";
import type { ReportTypeValue } from "@/lib/pdf/constants";
import { removeReportFromStorage, uploadReportToStorage } from "@/lib/storage/uploadReport";

export type PersistReportInput = {
  type: ReportTypeValue | string;
  title: string;
  relatedId: string | null;
  fileName: string;
  pdfBytes: Uint8Array;
  createdById: string | null;
};

export async function persistGeneratedReport(input: PersistReportInput) {
  const { path: filePath, publicUrl } = await uploadReportToStorage({
    pdfBlob: input.pdfBytes,
    type: input.type,
    filename: input.fileName,
  });

  const report = await prisma.generatedReport.create({
    data: {
      type: input.type,
      title: input.title,
      relatedId: input.relatedId,
      fileName: input.fileName,
      filePath,
      publicUrl,
      createdById: input.createdById,
    },
  });

  return { report, publicUrl, filePath };
}

export async function deleteGeneratedReportRecord(id: string): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.generatedReport.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "לא נמצא" };

  if (row.filePath) {
    await removeReportFromStorage(row.filePath);
  }

  await prisma.generatedReport.delete({ where: { id } });
  return { ok: true };
}
