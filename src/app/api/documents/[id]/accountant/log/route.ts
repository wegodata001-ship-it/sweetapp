import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const rows = await prismaAny.accountantTransferLog.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      include: { performedBy: { select: { id: true, fullName: true } } },
    });
    type LogRow = {
      id: string;
      documentId: string;
      action: string;
      createdAt: Date;
      performedBy: { id: string; fullName: string } | null;
    };
    return NextResponse.json({
      ok: true,
      data: rows.map((r: LogRow) => ({
        id: r.id,
        document_id: r.documentId,
        action: r.action,
        performed_by: r.performedBy
          ? { id: r.performedBy.id, full_name: r.performedBy.fullName }
          : null,
        created_at: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
