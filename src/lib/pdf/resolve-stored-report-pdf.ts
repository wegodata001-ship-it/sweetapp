import { prisma } from "@/lib/prisma";
import { isPdfPayload } from "@/lib/pdf/pdf-bytes";
import { reportsBucketName } from "@/lib/storage/buckets";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export type ResolvedReportPdf = {
  bytes: Uint8Array;
  fileName: string;
  filePath: string;
};

/**
 * Read an already stored report PDF.
 * One row lookup plus one storage download. Does not generate a PDF.
 */
export async function resolveStoredReportPdf(reportId: string): Promise<ResolvedReportPdf | null> {
  const id = reportId.trim();
  if (!id) return null;
  const row = await prisma.generatedReport.findUnique({
    where: { id },
    select: { filePath: true, fileName: true },
  });
  const filePath = row?.filePath?.trim();
  if (!filePath) return null;

  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(reportsBucketName()).download(filePath);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!isPdfPayload("application/pdf", bytes)) return null;
  const fileName = row?.fileName?.trim() || "document.pdf";
  return { bytes, fileName: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, filePath };
}

export function pdfContentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "document.pdf";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
