import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import {
  listLocationWorkers,
  syncLocationWorkers,
  type LocationWorkerInput,
} from "@/lib/inventory/location-workers";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const { id } = await ctx.params;
  try {
    const loc = await prismaAny.inventoryLocation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!loc) {
      return NextResponse.json({ ok: false, error: "מיקום לא נמצא" }, { status: 404 });
    }
    const workers = await listLocationWorkers(id);
    return NextResponse.json({ ok: true, data: workers });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

/** PUT — סנכרון רשימת העובדים (soft sync ל־InventoryLocationWorker, ללא מחיקה קשה) */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const loc = await prismaAny.inventoryLocation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!loc) {
      return NextResponse.json({ ok: false, error: "מיקום לא נמצא" }, { status: 404 });
    }

    const body = (await req.json()) as { workers?: LocationWorkerInput[] };
    const workers = await syncLocationWorkers(id, body.workers ?? []);
    return NextResponse.json({ ok: true, data: workers });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
