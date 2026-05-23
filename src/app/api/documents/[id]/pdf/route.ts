import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { runDocumentPdfJob } from "@/lib/pdf/run-document-pdf-job";

export const dynamic = "force-dynamic";

type PdfStatus = "none" | "processing" | "ready" | "failed";

async function resolvePdfStatus(documentId: string): Promise<{
  status: PdfStatus;
  pdfUrl?: string;
  reportId?: string;
}> {
  const report = await prisma.generatedReport.findFirst({
    where: { relatedId: documentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, publicUrl: true },
  });
  if (report?.publicUrl) {
    return { status: "ready", pdfUrl: report.publicUrl, reportId: report.id };
  }

  const doc = await prisma.financialDocument.findUnique({
    where: { id: documentId },
    select: { pdfStoragePath: true },
  });
  if (doc?.pdfStoragePath) {
    return { status: "ready" };
  }

  return { status: "none" };
}

/** סטטוס PDF למסמך */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.financialDocument.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!doc) {
    return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });
  }

  const resolved = await resolvePdfStatus(id);
  return NextResponse.json({ ok: true, ...resolved });
}

/** תור יצירת PDF — מחזיר 202 מיד; העיבוד ברקע */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.financialDocument.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!doc) {
    return NextResponse.json({ ok: false, error: "מסמך לא נמצא" }, { status: 404 });
  }

  const existing = await resolvePdfStatus(id);
  if (existing.status === "ready" && existing.pdfUrl) {
    return NextResponse.json({ ok: true, status: "ready", pdfUrl: existing.pdfUrl });
  }

  const userId = session.sub;
  after(async () => {
    try {
      await runDocumentPdfJob(id, userId);
    } catch (e) {
      console.error("[documents/pdf background]", id, e);
    }
  });

  return NextResponse.json(
    { ok: true, status: "processing" as const },
    { status: 202 },
  );
}
