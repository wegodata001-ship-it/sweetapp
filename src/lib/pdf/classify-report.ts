import { prisma } from "@/lib/prisma";
import { parsePayload } from "@/lib/finance/document-payload";
import { REPORT_TYPES, type ReportTypeValue } from "@/lib/pdf/constants";

export async function inferReportTypeForDocumentId(documentId: string): Promise<
  typeof REPORT_TYPES.INCOME | typeof REPORT_TYPES.EXPENSE | typeof REPORT_TYPES.Z_REPORT
> {
  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: { category: true, metadata: true },
  });
  if (!doc) throw new Error("מסמך לא נמצא");
  const p = parsePayload(doc.metadata as unknown);
  if (p?.kind === "zreport" || doc.category === "דוח Z") return REPORT_TYPES.Z_REPORT;
  if (p?.kind === "expense" || doc.category === "הוצאה") return REPORT_TYPES.EXPENSE;
  return REPORT_TYPES.INCOME;
}

export function titleForReportType(type: ReportTypeValue, extra?: string): string {
  switch (type) {
    case REPORT_TYPES.INCOME:
      return extra ? `הכנסה — ${extra}` : "דוח הכנסה";
    case REPORT_TYPES.EXPENSE:
      return extra ? `הוצאה — ${extra}` : "דוח הוצאה";
    case REPORT_TYPES.Z_REPORT:
      return extra ? `דוח Z — ${extra}` : "דוח Z";
    case REPORT_TYPES.CASHFLOW:
      return extra ? `תזרים — ${extra}` : "דוח תזרים מזומנים";
    case REPORT_TYPES.PAYMENT:
      return extra ? `תשלום — ${extra}` : "קבלת תשלום";
    default:
      return "דוח PDF";
  }
}
