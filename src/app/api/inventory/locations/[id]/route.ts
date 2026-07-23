import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isLocationType } from "@/lib/inventory/location-types";
import {
  syncLocationWorkers,
  serializeWorker,
  WORKER_SELECT,
  type LocationWorkerInput,
} from "@/lib/inventory/location-workers";

const LOCATION_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  locationType: true,
  targetProductCount: true,
  color: true,
  icon: true,
  isActive: true,
  createdAt: true,
  workers: {
    where: { isActive: true },
    orderBy: { displayOrder: "asc" as const },
    select: WORKER_SELECT,
  },
} as const;

function serializeLocation(r: {
  createdAt: Date;
  workers?: Parameters<typeof serializeWorker>[0][];
  [k: string]: unknown;
}) {
  const { workers, ...rest } = r;
  return {
    ...rest,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    workers: Array.isArray(workers) ? workers.map(serializeWorker) : [],
  };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as {
    name?: string;
    code?: string | null;
    description?: string | null;
    locationType?: string | null;
    targetProductCount?: number | null;
    color?: string | null;
    icon?: string | null;
    isActive?: boolean;
    workers?: LocationWorkerInput[];
  };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ ok: false, error: "שם ריק" }, { status: 400 });
    data.name = name;
  }
  if (body.code !== undefined) data.code = body.code?.trim() || null;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.locationType !== undefined) {
    const t = (body.locationType ?? "").trim().toUpperCase();
    if (!isLocationType(t)) {
      return NextResponse.json({ ok: false, error: "סוג מיקום לא תקין" }, { status: 400 });
    }
    data.locationType = t;
  }
  if (body.targetProductCount !== undefined) {
    if (body.targetProductCount == null) {
      data.targetProductCount = null;
    } else {
      const n = Math.floor(Number(body.targetProductCount));
      data.targetProductCount = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }
  if (body.color !== undefined) data.color = body.color?.trim() || null;
  if (body.icon !== undefined) data.icon = body.icon?.trim() || null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  if (Object.keys(data).length === 0 && body.workers === undefined) {
    return NextResponse.json({ ok: false, error: "אין שדות לעדכון" }, { status: 400 });
  }

  try {
    // עדכון שם — מסנכרן גם את טקסט location במוצרים (ללא מחיקת ספירות)
    const existing = await prismaAny.inventoryLocation.findUnique({
      where: { id },
      select: { name: true },
    });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }

    const row = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      if (Object.keys(data).length > 0) {
        await tx.inventoryLocation.update({ where: { id }, data });
      }
      if (body.workers !== undefined) {
        await syncLocationWorkers(id, body.workers, tx);
      }
      return tx.inventoryLocation.findUniqueOrThrow({
        where: { id },
        select: LOCATION_SELECT,
      });
    });

    if (typeof data.name === "string" && data.name !== existing.name) {
      await prismaAny.inventoryProduct.updateMany({
        where: { locationId: id },
        data: { location: data.name as string },
      });
    }

    return NextResponse.json({ ok: true, data: serializeLocation(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return NextResponse.json({ ok: false, error: "שם מיקום כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg || "שגיאה" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const [primaryProducts, placements, countsAtLocation, workers, sessions] =
      await Promise.all([
        prismaAny.inventoryProduct.count({ where: { locationId: id } }),
        prismaAny.inventoryProductOnLocation.count({ where: { locationId: id } }),
        prismaAny.inventoryCount.count({ where: { locationId: id } }),
        prismaAny.inventoryLocationWorker.count({ where: { inventoryLocationId: id } }),
        prismaAny.inventoryCountSession.count({ where: { locationId: id } }),
      ]);

    const linkedProducts = primaryProducts + placements;
    const linkedCounts = countsAtLocation + sessions;

    // מחיקה בטוחה: מוצרים / placements / ספירות / עובדים / סשנים → השבתה בלבד
    // (מונע 500 מ־InventoryCountWorker Restrict על hard delete)
    if (linkedProducts > 0 || linkedCounts > 0 || workers > 0) {
      await prismaAny.inventoryLocation.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        ok: true,
        data: {
          deactivated: true,
          linkedProducts,
          linkedCounts,
          linkedWorkers: workers,
        },
      });
    }

    await prismaAny.inventoryLocation.delete({ where: { id } });
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
