import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { RECON_STATUS } from "@/lib/controls/reconciliation-constants";
import type { ReconImportDto } from "@/lib/controls/reconciliation-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  try {
    const imports = await prisma.systemReconciliationImport.findMany({
      orderBy: { importedAt: "desc" },
      take: 100,
      include: {
        importedBy: { select: { fullName: true } },
        rows: { select: { status: true } },
      },
    });
    const data: ReconImportDto[] = imports.map((imp) => ({
      id: imp.id,
      country: imp.country,
      weekCode: imp.weekCode,
      fileName: imp.fileName,
      importedAt: imp.importedAt.toISOString(),
      importedByName: imp.importedBy?.fullName ?? null,
      totalRows: imp.totalRows,
      matched: imp.rows.some((r) => r.status !== RECON_STATUS.PENDING),
    }));
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
