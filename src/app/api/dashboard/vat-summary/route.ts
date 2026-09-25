import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { loadVatSummary } from "@/lib/finance/load-vat-summary";
import { vatSummaryReconciles } from "@/lib/finance/vat-summary";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session) return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });

  const from = req.nextUrl.searchParams.get("from")?.trim() ?? "";
  const to = req.nextUrl.searchParams.get("to")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return NextResponse.json({ ok: false, error: "טווח תאריכים לא תקין" }, { status: 400 });
  }

  const summary = await loadVatSummary(from, to);

  const reconciled = vatSummaryReconciles(summary);
  if (!reconciled.ok) {
    console.error("[vat-summary] detail rows do not add up to the summary", { from, to });
  }

  return NextResponse.json({
    ok: true,
    data: summary,
    needsReview: !reconciled.ok,
    disclaimer: "estimated",
  });
}
