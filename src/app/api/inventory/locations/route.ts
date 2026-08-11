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
import { LOCATION_ORDER_BY } from "@/lib/inventory/count-latest";

const LOCATION_SELECT = {
  id: true,
  name: true,
  code: true,
  description: true,
  locationType: true,
  targetProductCount: true,
  color: true,
  icon: true,
  displayOrder: true,
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

function parseLocationBody(body: {
  name?: string;
  code?: string | null;
  description?: string | null;
  locationType?: string | null;
  targetProductCount?: number | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
}) {
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return { error: "חסר שם מיקום" as const };
    data.name = name;
  }
  if (body.code !== undefined) data.code = body.code?.trim() || null;
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.locationType !== undefined) {
    const t = (body.locationType ?? "WAREHOUSE").trim().toUpperCase();
    if (!isLocationType(t)) return { error: "סוג מיקום לא תקין" as const };
    data.locationType = t;
  }
  if (body.targetProductCount !== undefined) {
    if (body.targetProductCount == null || body.targetProductCount === ("" as unknown)) {
      data.targetProductCount = null;
    } else {
      const n = Math.floor(Number(body.targetProductCount));
      data.targetProductCount = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }
  if (body.color !== undefined) data.color = body.color?.trim() || null;
  if (body.icon !== undefined) data.icon = body.icon?.trim() || null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  return { data };
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const { searchParams } = req.nextUrl;
  const includeInactive = searchParams.get("all") === "1";

  try {
    const rows = await prismaAny.inventoryLocation.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: LOCATION_ORDER_BY,
      select: LOCATION_SELECT,
    });
    return NextResponse.json({
      ok: true,
      data: rows.map((r: { createdAt: Date; [k: string]: unknown }) => serializeLocation(r)),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
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
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ ok: false, error: "חסר שם מיקום" }, { status: 400 });

    const parsed = parseLocationBody(body);
    if ("error" in parsed && parsed.error) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const row = await prismaAny.$transaction(async (tx: typeof prismaAny) => {
      const maxOrder = await tx.inventoryLocation.aggregate({
        _max: { displayOrder: true },
      });
      const created = await tx.inventoryLocation.create({
        data: {
          name,
          code: (parsed.data?.code as string | null | undefined) ?? null,
          description: (parsed.data?.description as string | null | undefined) ?? null,
          locationType: (parsed.data?.locationType as string | undefined) ?? "WAREHOUSE",
          targetProductCount: (parsed.data?.targetProductCount as number | null | undefined) ?? null,
          color: (parsed.data?.color as string | null | undefined) ?? null,
          icon: (parsed.data?.icon as string | null | undefined) ?? null,
          displayOrder: Number(maxOrder._max?.displayOrder ?? 0) + 1,
          isActive: typeof body.isActive === "boolean" ? body.isActive : true,
        },
        select: { id: true },
      });
      if (body.workers) {
        await syncLocationWorkers(created.id, body.workers, tx);
      }
      return tx.inventoryLocation.findUniqueOrThrow({
        where: { id: created.id },
        select: LOCATION_SELECT,
      });
    });

    // קישור מוצרים ישנים עם אותו שם מיקום (טקסט) ל־FK — ללא מחיקת ספירות
    await prismaAny.inventoryProduct.updateMany({
      where: {
        locationId: null,
        location: { equals: name, mode: "insensitive" },
      },
      data: { locationId: row.id, location: name },
    });

    return NextResponse.json({ ok: true, data: serializeLocation(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint")) {
      return NextResponse.json({ ok: false, error: "שם מיקום כבר קיים" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg || "שגיאה" }, { status: 500 });
  }
}
