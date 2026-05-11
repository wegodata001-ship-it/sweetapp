import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { REPORT_TYPES } from "@/lib/pdf/constants";
import { inferReportTypeForDocumentId, titleForReportType } from "@/lib/pdf/classify-report";
import { generateFinancialDocumentPdfBytes } from "@/lib/pdf/generate-financial-document-pdf";
import { generatePaymentPdfBytes } from "@/lib/pdf/generate-payment-pdf";
import { persistGeneratedReport } from "@/lib/pdf/persist-generated-report";
import { erpReportFileName } from "@/lib/storage/report-file-names";

/** תאימות לאחור — מומלץ להשתמש ב־POST /api/reports/generate */
export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { documentId?: string; paymentId?: string };

    if (body.documentId?.trim()) {
      const id = body.documentId.trim();
      const doc = await prisma.financialDocument.findUnique({
        where: { id },
        include: { customer: { select: { name: true } } },
      });
      if (!doc) return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });

      const bytes = await generateFinancialDocumentPdfBytes(id);
      const reportType = await inferReportTypeForDocumentId(id);
      const docDate = doc.docDate ?? doc.createdAt;
      const fileName = erpReportFileName(reportType, docDate, new Date());

      const { report, publicUrl } = await persistGeneratedReport({
        type: reportType,
        title: titleForReportType(reportType, doc.title),
        relatedId: id,
        fileName,
        pdfBytes: bytes,
        createdById: session.sub,
      });

      await prisma.financialDocument.update({
        where: { id },
        data: { pdfStoragePath: report.filePath },
      });

      return NextResponse.json({
        ok: true,
        pdfUrl: publicUrl,
        reportId: report.id,
      });
    }

    if (body.paymentId?.trim()) {
      const id = body.paymentId.trim();
      const pay = await prisma.payment.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!pay) return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });

      const bytes = await generatePaymentPdfBytes(id);
      const fileName = erpReportFileName(REPORT_TYPES.PAYMENT, pay.createdAt, new Date());

      const { report, publicUrl } = await persistGeneratedReport({
        type: REPORT_TYPES.PAYMENT,
        title: titleForReportType(REPORT_TYPES.PAYMENT, pay.customer.name),
        relatedId: id,
        fileName,
        pdfBytes: bytes,
        createdById: session.sub,
      });

      return NextResponse.json({
        ok: true,
        pdfUrl: publicUrl,
        reportId: report.id,
      });
    }

    return NextResponse.json({ ok: false, error: "נדרש documentId או paymentId" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
