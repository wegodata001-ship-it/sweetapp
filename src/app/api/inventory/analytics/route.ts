import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getInventoryAnalyticsDashboard } from "@/lib/inventory/analytics-service";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const sp = req.nextUrl.searchParams;
  try {
    const started = Date.now();
    const data = await getInventoryAnalyticsDashboard({
      range: sp.get("range"),
      from: sp.get("from"),
      to: sp.get("to"),
      locationId: sp.get("locationId"),
      workerId: sp.get("workerId"),
      category: sp.get("category"),
      productId: sp.get("productId"),
    });
    return NextResponse.json({
      ok: true,
      data,
      meta: { ms: Date.now() - started },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
