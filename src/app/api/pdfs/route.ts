import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { runDocumentPdfJob, runPaymentPdfJob } from "@/lib/pdf/run-document-pdf-job";

/** תאימות לאחור — מומלץ POST /api/documents/:id/pdf (רקע) */
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
        select: { id: true },
      });
      if (!doc) return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });

      const result = await runDocumentPdfJob(id, session.sub);
      return NextResponse.json({
        ok: true,
        pdfUrl: result.pdfUrl,
        reportId: result.reportId,
      });
    }

    if (body.paymentId?.trim()) {
      const id = body.paymentId.trim();
      const pay = await prisma.payment.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!pay) return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });

      const result = await runPaymentPdfJob(id, session.sub);
      return NextResponse.json({
        ok: true,
        pdfUrl: result.pdfUrl,
        reportId: result.reportId,
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
