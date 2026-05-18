import { NextResponse } from "next/server";
import { prisma, prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { syncCheckPaymentsForDocument } from "@/lib/finance/document-side-effects";
import { parsePayload } from "@/lib/finance/document-payload";

export const dynamic = "force-dynamic";

/**
 * /api/checks/backfill
 *
 * Scans existing income documents and recreates any missing CheckPayment rows.
 * Useful after the inline-check feature was introduced — sweeps through all
 * income docs whose metadata has CHECK payment lines and ensures the checks
 * table reflects them.
 *
 * Safe to re-run: `syncCheckPaymentsForDocument` is idempotent and won't
 * duplicate existing rows.
 */
export async function POST() {
  const block = await requireDb();
  if (block) return block;

  try {
    const docs = await prisma.financialDocument.findMany({
      where: { category: "הכנסה" },
      select: { id: true, metadata: true },
    });

    let candidates = 0;
    let synced = 0;
    const errors: string[] = [];

    for (const d of docs) {
      const meta = parsePayload(d.metadata as unknown);
      if (meta?.kind !== "income") continue;
      const hasCheckLine = (meta.payments ?? []).some(
        (p) => p.instrument === "CHECK" && p.check,
      );
      if (!hasCheckLine) continue;
      candidates++;
      try {
        await syncCheckPaymentsForDocument(d.id);
        synced++;
      } catch (e) {
        errors.push(
          `${d.id}: ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    }

    const totalChecks = (await prismaAny.checkPayment.count()) as number;

    return NextResponse.json({
      ok: true,
      scanned: docs.length,
      candidatesWithChecks: candidates,
      synced,
      totalChecks,
      errors,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "internal error" },
      { status: 500 },
    );
  }
}

export const GET = POST;
