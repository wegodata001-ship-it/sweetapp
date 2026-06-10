import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const [transferRows, emailRows] = await Promise.all([
      prismaAny.accountantTransferLog.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "desc" },
        include: { performedBy: { select: { id: true, fullName: true } } },
      }),
      prismaAny.accountantEmailLog.findMany({
        where: { documentId: id },
        orderBy: { sentAt: "desc" },
        include: { sentBy: { select: { id: true, fullName: true } } },
      }),
    ]);

    type TransferRow = {
      id: string;
      documentId: string;
      action: string;
      createdAt: Date;
      performedBy: { id: string; fullName: string } | null;
    };
    type EmailRow = {
      id: string;
      documentId: string;
      sentAt: Date;
      sentTo: string;
      recipientEmails: string | null;
      sentById: string | null;
      attachmentsCount: number;
      documentsCount: number;
      attachmentMode: string | null;
      sentBy: { id: string; fullName: string } | null;
    };

    const transferEntries = (transferRows as TransferRow[]).map((r) => ({
      id: r.id,
      document_id: r.documentId,
      action: r.action,
      performed_by: r.performedBy
        ? { id: r.performedBy.id, full_name: r.performedBy.fullName }
        : null,
      created_at: r.createdAt.toISOString(),
      sent_to: null as string | null,
      attachments_count: null as number | null,
    }));

    const emailEntries = (emailRows as EmailRow[]).map((r) => ({
      id: r.id,
      document_id: r.documentId,
      action: "email_sent" as const,
      performed_by: r.sentBy ? { id: r.sentBy.id, full_name: r.sentBy.fullName } : null,
      created_at: r.sentAt.toISOString(),
      sent_to: r.recipientEmails?.trim() || r.sentTo,
      attachments_count: r.attachmentsCount,
      documents_count: r.documentsCount,
      attachment_mode: r.attachmentMode,
    }));

    const merged = [...transferEntries, ...emailEntries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    return NextResponse.json({ ok: true, data: merged });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
