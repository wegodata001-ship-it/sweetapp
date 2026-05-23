import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { runPaymentPdfJob } from "@/lib/pdf/run-document-pdf-job";

export const dynamic = "force-dynamic";

async function resolvePaymentPdfStatus(paymentId: string) {
  const report = await prisma.generatedReport.findFirst({
    where: { relatedId: paymentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, publicUrl: true },
  });
  if (report?.publicUrl) {
    return { status: "ready" as const, pdfUrl: report.publicUrl, reportId: report.id };
  }
  return { status: "none" as const };
}

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
  const pay = await prisma.payment.findUnique({ where: { id }, select: { id: true } });
  if (!pay) {
    return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });
  }

  const resolved = await resolvePaymentPdfStatus(id);
  return NextResponse.json({ ok: true, ...resolved });
}

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
  const pay = await prisma.payment.findUnique({ where: { id }, select: { id: true } });
  if (!pay) {
    return NextResponse.json({ ok: false, error: "תשלום לא נמצא" }, { status: 404 });
  }

  const existing = await resolvePaymentPdfStatus(id);
  if (existing.status === "ready" && existing.pdfUrl) {
    return NextResponse.json({ ok: true, status: "ready", pdfUrl: existing.pdfUrl });
  }

  const userId = session.sub;
  after(async () => {
    try {
      await runPaymentPdfJob(id, userId);
    } catch (e) {
      console.error("[payments/pdf background]", id, e);
    }
  });

  return NextResponse.json({ ok: true, status: "processing" }, { status: 202 });
}
