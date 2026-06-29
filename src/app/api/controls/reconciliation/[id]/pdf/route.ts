import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { loadImportDetail } from "@/lib/controls/reconciliation-load";
import { generateReconciliationPdf } from "@/lib/controls/reconciliation-pdf";
import { reconciliationExportFileName } from "@/lib/controls/reconciliation-export";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const detail = await loadImportDetail(id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "ייבוא לא נמצא" }, { status: 404 });
  }
  const bytes = await generateReconciliationPdf(detail);
  const fileName = reconciliationExportFileName(detail.import.weekCode, "pdf");
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
