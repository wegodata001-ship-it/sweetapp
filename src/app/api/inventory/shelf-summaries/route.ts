import { NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { listShelfSummaries, type ShelfSummaryStats } from "@/lib/inventory/shelf-service";
import type { CountLifecycleStatus } from "@/lib/inventory/location-types";
import { ensureLocationSchemaColumns } from "@/lib/inventory/ensure-location-schema";

export type ShelfSummaryDto = {
  name: string;
  locationId: string | null;
  code: string | null;
  description: string | null;
  locationType: string;
  targetProductCount: number | null;
  color: string | null;
  isActive: boolean;
  createdAt: string | null;
  displayOrder: number;
  productCount: number;
  shortageCount: number;
  surplusCount: number;
  okCount: number;
  matchPct: number;
  countedProductCount: number;
  lastCountAt: string | null;
  lastCountedByName: string | null;
  countStatus: CountLifecycleStatus;
};

function toDto(s: ShelfSummaryStats): ShelfSummaryDto {
  return {
    name: s.name,
    locationId: s.locationId,
    code: s.code,
    description: s.description,
    locationType: s.locationType,
    targetProductCount: s.targetProductCount,
    color: s.color,
    isActive: s.isActive,
    createdAt: s.createdAt,
    displayOrder: s.displayOrder ?? 0,
    productCount: s.productCount,
    shortageCount: s.shortageCount,
    surplusCount: s.surplusCount,
    okCount: s.okCount,
    matchPct: s.matchPct,
    countedProductCount: s.countedProductCount,
    lastCountAt: s.lastCountAt,
    lastCountedByName: s.lastCountedByName,
    countStatus: s.countStatus,
  };
}

/** סיכומי מדפים — SSOT: productsOnShelfWhere (via listShelfSummaries) */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    await ensureLocationSchemaColumns();
    const data = (await listShelfSummaries()).map(toDto);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
