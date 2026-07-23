import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { searchAnalyticsProducts } from "@/lib/inventory/analytics-service";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  try {
    const data = await searchAnalyticsProducts(q, 24);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
