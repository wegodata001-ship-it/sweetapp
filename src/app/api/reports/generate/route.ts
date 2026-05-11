import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { REPORT_TYPES } from "@/lib/pdf/constants";
import { inferReportTypeForDocumentId, titleForReportType } from "@/lib/pdf/classify-report";
import { generateFinancialDocumentPdfBytes } from "@/lib/pdf/generate-financial-document-pdf";
import { generateCashFlowPdfBytes } from "@/lib/pdf/generate-cashflow-pdf";
import { generatePaymentPdfBytes } from "@/lib/pdf/generate-payment-pdf";
import { persistGeneratedReport } from "@/lib/pdf/persist-generated-report";
import { erpReportFileName } from "@/lib/storage/report-file-names";

/**
 * יצירת PDF + שמירה ב־Storage + רשומת GeneratedReport
 * body: { entity: "document" | "cashflow" | "payment", relatedId: string }
 */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      entity?: string;
      relatedId?: string;
    };
    const entity = body.entity?.trim().toLowerCase();
    const relatedId = body.relatedId?.trim();
    if (!entity || !relatedId) {
      return NextResponse.json({ ok: false, error: "חסר entity או relatedId" }, { status: 400 });
    }

    if (entity === "document") {
      const doc = await prisma.financialDocument.findUnique({
        where: { id: relatedId },
        include: { customer: { select: { name: true } } },
      });
      if (!doc) return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });

      const reportType = await inferReportTypeForDocumentId(relatedId);
      const bytes = await generateFinancialDocumentPdfBytes(relatedId);
      const docDate = doc.docDate ?? doc.createdAt;
      const fileName = erpReportFileName(reportType, docDate, new Date());

      const { report, publicUrl } = await persistGeneratedReport({
        type: reportType,
        title: titleForReportType(reportType, doc.title),
        relatedId,
        fileName,
        pdfBytes: bytes,
        createdById: session.sub,
      });

      await prisma.financialDocument.update({
        where: { id: relatedId },
        data: { pdfStoragePath: report.filePath },
      });

      return NextResponse.json({
        ok: true,
        pdfUrl: publicUrl,
        reportId: report.id,
        publicUrl,
        type: reportType,
      });
    }

    if (entity === "cashflow") {
      const entry = await prisma.cashFlowEntry.findUnique({ where: { id: relatedId } });
      if (!entry) return NextResponse.json({ ok: false, error: "תנועה לא נמצאה" }, { status: 404 });

      const bytes = await generateCashFlowPdfBytes(relatedId);
      const fileName = erpReportFileName(REPORT_TYPES.CASHFLOW, new Date(entry.entryDate), new Date());
      const title =
        (entry.description?.trim() || "תנועת תזרים") +
        " · " +
        entry.entryDate.toISOString().slice(0, 10);

      const { report, publicUrl } = await persistGeneratedReport({
        type: REPORT_TYPES.CASHFLOW,
        title: titleForReportType(REPORT_TYPES.CASHFLOW, entry.entryDate.toISOString().slice(0, 10)),
        relatedId,
        fileName,
        pdfBytes: bytes,
        createdById: session.sub,
      });

      return NextResponse.json({
        ok: true,
        pdfUrl: publicUrl,
        reportId: report.id,
        publicUrl,
        type: REPORT_TYPES.CASHFLOW,
      });
    }

    if (entity === "payment") {
      const pay = await prisma.payment.findUnique({
        where: { id: relatedId },
        include: { customer: true },
      });
      if (!pay) return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });

      const bytes = await generatePaymentPdfBytes(relatedId);
      const fileName = erpReportFileName(REPORT_TYPES.PAYMENT, pay.createdAt, new Date());

      const { report, publicUrl } = await persistGeneratedReport({
        type: REPORT_TYPES.PAYMENT,
        title: titleForReportType(REPORT_TYPES.PAYMENT, pay.customer.name),
        relatedId,
        fileName,
        pdfBytes: bytes,
        createdById: session.sub,
      });

      return NextResponse.json({
        ok: true,
        pdfUrl: publicUrl,
        reportId: report.id,
        publicUrl,
        type: REPORT_TYPES.PAYMENT,
      });
    }

    return NextResponse.json({ ok: false, error: "entity לא נתמך" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
