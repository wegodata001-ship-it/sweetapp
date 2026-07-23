import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getAnalyticsDrill } from "@/lib/inventory/analytics-service";
import type { AnalyticsDrillType } from "@/lib/inventory/analytics-types";

const TYPES = new Set<AnalyticsDrillType>([
  "shortages",
  "surpluses",
  "uncounted",
  "belowMinimum",
  "noMovement",
  "activeLocations",
  "counts",
  "workers",
  "locations",
]);

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") as AnalyticsDrillType | null;
  if (!type || !TYPES.has(type)) {
    return NextResponse.json({ ok: false, error: "סוג drill לא תקין" }, { status: 400 });
  }

  try {
    const data = await getAnalyticsDrill(type, {
      range: sp.get("range"),
      from: sp.get("from"),
      to: sp.get("to"),
      locationId: sp.get("locationId"),
      category: sp.get("category"),
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
