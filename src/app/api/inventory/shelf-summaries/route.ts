import { NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import type { CountLifecycleStatus } from "@/lib/inventory/location-types";

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

/** סיכומי מדפים — לפי InventoryLocation + מוצרים משויכים / טקסט location */
export async function GET() {
  const block = await requireDb();
  if (block) return block;
  try {
    const [locations, products] = await Promise.all([
      prismaAny.inventoryLocation.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          locationType: true,
          targetProductCount: true,
          color: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prismaAny.inventoryProduct.findMany({
        where: {
          OR: [
            { locationId: { not: null } },
            { NOT: { location: { equals: "", mode: "insensitive" } } },
          ],
        },
        select: {
          id: true,
          location: true,
          locationId: true,
          counts: {
            orderBy: { countDate: "desc" },
            take: 1,
            select: {
              difference: true,
              countDate: true,
              countedBy: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);

    type Acc = {
      name: string;
      locationId: string | null;
      code: string | null;
      description: string | null;
      locationType: string;
      targetProductCount: number | null;
      color: string | null;
      isActive: boolean;
      createdAt: string | null;
      productCount: number;
      shortageCount: number;
      surplusCount: number;
      okCount: number;
      countedProductCount: number;
      lastCountAt: Date | null;
      lastCountedByName: string | null;
    };

    const byKey = new Map<string, Acc>();

    const ensure = (
      key: string,
      seed: Partial<Acc> & { name: string },
    ): Acc => {
      const cur = byKey.get(key);
      if (cur) return cur;
      const row: Acc = {
        name: seed.name,
        locationId: seed.locationId ?? null,
        code: seed.code ?? null,
        description: seed.description ?? null,
        locationType: seed.locationType ?? "WAREHOUSE",
        targetProductCount: seed.targetProductCount ?? null,
        color: seed.color ?? null,
        isActive: seed.isActive ?? true,
        createdAt: seed.createdAt ?? null,
        productCount: 0,
        shortageCount: 0,
        surplusCount: 0,
        okCount: 0,
        countedProductCount: 0,
        lastCountAt: null,
        lastCountedByName: null,
      };
      byKey.set(key, row);
      return row;
    };

    for (const loc of locations as Array<{
      id: string;
      name: string;
      code: string | null;
      description: string | null;
      locationType: string;
      targetProductCount: number | null;
      color: string | null;
      isActive: boolean;
      createdAt: Date;
    }>) {
      ensure(loc.id, {
        name: loc.name.trim(),
        locationId: loc.id,
        code: loc.code,
        description: loc.description,
        locationType: loc.locationType || "WAREHOUSE",
        targetProductCount: loc.targetProductCount,
        color: loc.color,
        isActive: loc.isActive,
        createdAt: loc.createdAt.toISOString(),
      });
    }

    for (const p of products as Array<{
      location: string;
      locationId: string | null;
      counts: Array<{
        difference: number;
        countDate: Date;
        countedBy: { fullName: string } | null;
      }>;
    }>) {
      const locId = p.locationId?.trim() || null;
      const textName = (p.location ?? "").trim();
      const key = locId || `name:${textName}`;
      if (!locId && !textName) continue;

      const cur = ensure(key, {
        name: textName || key,
        locationId: locId,
      });
      if (!cur.name && textName) cur.name = textName;

      cur.productCount += 1;
      const latest = p.counts[0];
      if (latest) {
        cur.countedProductCount += 1;
        const diff = latest.difference;
        if (diff < 0) cur.shortageCount += 1;
        else if (diff > 0) cur.surplusCount += 1;
        else cur.okCount += 1;

        if (!cur.lastCountAt || latest.countDate > cur.lastCountAt) {
          cur.lastCountAt = latest.countDate;
          cur.lastCountedByName = latest.countedBy?.fullName ?? null;
        }
      }
    }

    const data: ShelfSummaryDto[] = [...byKey.values()]
      .filter((s) => s.isActive || s.productCount > 0)
      .map((s) => {
        let countStatus: CountLifecycleStatus = "NOT_STARTED";
        if (s.productCount > 0 && s.countedProductCount >= s.productCount) {
          countStatus = "COMPLETED";
        } else if (s.countedProductCount > 0) {
          countStatus = "IN_PROGRESS";
        }
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
          productCount: s.productCount,
          shortageCount: s.shortageCount,
          surplusCount: s.surplusCount,
          okCount: s.okCount,
          matchPct:
            s.productCount > 0 ? Math.round((s.okCount / s.productCount) * 100) : 100,
          countedProductCount: s.countedProductCount,
          lastCountAt: s.lastCountAt ? s.lastCountAt.toISOString() : null,
          lastCountedByName: s.lastCountedByName,
          countStatus,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "he", { sensitivity: "base" }));

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
