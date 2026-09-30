import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { loadRecentLedgerActivity } from "@/lib/finance/recent-ledger-activity";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const data = await loadRecentLedgerActivity(prisma);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error("recent ledger activity failed");
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
