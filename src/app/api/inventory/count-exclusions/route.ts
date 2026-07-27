import { NextRequest, NextResponse } from "next/server";
import { prismaAny } from "@/lib/prisma";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { logActivity } from "@/lib/activity-log";
import { canRemoveCountRow } from "@/lib/inventory/count-access";
import {
  listExcludedRows,
  resolveCountRoundScope,
  type CountRoundScope,
} from "@/lib/inventory/count-exclusions";
import { resolveShelf } from "@/lib/inventory/shelf-service";

/**
 * הסרת מוצר מסבב ספירה והשבתו — Soft Delete בלבד.
 * לא נמחק מוצר, שיוך למדף, שורת ספירה, סשן או היסטוריה.
 *
 * GET    — השורות שהוסרו מהסבב הנוכחי
 * POST   — הסרת מוצר מהסבב הנוכחי
 * DELETE — שחזור מוצר לסבב (ביטול ההסרה)
 */

type ScopeInput = {
  locationId?: string | null;
  location?: string | null;
  countDate?: string | null;
};

async function resolveScope(
  input: ScopeInput,
): Promise<{ scope: CountRoundScope } | { error: NextResponse }> {
  const locationId = input.locationId?.trim() || null;
  const locationName = input.location?.trim() || undefined;
  if (!locationId && !locationName) {
    return {
      error: NextResponse.json(
        { ok: false, error: "נדרש locationId או location" },
        { status: 400 },
      ),
    };
  }
  const shelf = await resolveShelf(locationId, locationName);
  if (!shelf) {
    return {
      error: NextResponse.json({ ok: false, error: "מיקום האחסון לא נמצא" }, { status: 404 }),
    };
  }
  return { scope: resolveCountRoundScope(shelf, input.countDate) };
}

/** תיעוד ל־ActivityLog — מי, מתי (createdAt), איזה סבב, איזה מוצר */
function auditDetail(
  scope: CountRoundScope,
  extra: Record<string, string | null | undefined>,
): string {
  const parts: string[] = [
    `locationKey=${scope.locationKey}`,
    `locationId=${scope.locationId ?? "-"}`,
    `location=${scope.locationName || "-"}`,
    `countDay=${scope.countDay}`,
  ];
  for (const [key, value] of Object.entries(extra)) {
    if (value != null && value !== "") parts.push(`${key}=${value}`);
  }
  return parts.join(" ");
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const resolved = await resolveScope({
      locationId: searchParams.get("locationId"),
      location: searchParams.get("location"),
      countDate: searchParams.get("countDate"),
    });
    if ("error" in resolved) return resolved.error;

    const data = await listExcludedRows(resolved.scope);
    return NextResponse.json({
      ok: true,
      data,
      meta: {
        locationId: resolved.scope.locationId,
        locationName: resolved.scope.locationName,
        countDay: resolved.scope.countDay,
        canRemove: canRemoveCountRow(session.role),
      },
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
  if (!canRemoveCountRow(session.role)) {
    return NextResponse.json(
      { ok: false, error: "אין הרשאה להסיר מוצר מהספירה" },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as ScopeInput & {
      inventoryProductId?: string;
      productId?: string;
      reason?: string | null;
    };
    const productId = (body.inventoryProductId ?? body.productId)?.trim();
    if (!productId) {
      return NextResponse.json({ ok: false, error: "חסר מזהה מוצר" }, { status: 400 });
    }

    const resolved = await resolveScope(body);
    if ("error" in resolved) return resolved.error;
    const { scope } = resolved;

    // המוצר נשאר בקטלוג — הקריאה כאן רק לאימות קיום ולתיעוד השם
    const product = (await prismaAny.inventoryProduct.findUnique({
      where: { id: productId },
      select: { id: true, name: true, nameHe: true, nameAr: true },
    })) as { id: string; name: string; nameHe: string | null; nameAr: string | null } | null;
    if (!product) {
      return NextResponse.json({ ok: false, error: "המוצר לא נמצא" }, { status: 404 });
    }
    const productName =
      product.nameHe?.trim() || product.nameAr?.trim() || product.name;
    const reason = body.reason?.trim() || null;

    const row = (await prismaAny.inventoryCountExclusion.upsert({
      where: {
        locationKey_inventoryProductId_countDay: {
          locationKey: scope.locationKey,
          inventoryProductId: productId,
          countDay: scope.countDay,
        },
      },
      create: {
        locationKey: scope.locationKey,
        locationId: scope.locationId,
        locationName: scope.locationName,
        inventoryProductId: productId,
        countDay: scope.countDay,
        isRemoved: true,
        productName,
        reason,
        removedById: session.sub,
      },
      // הסרה חוזרת לאחר שחזור — מעדכנים במקום ומאפסים את סימני השחזור
      update: {
        isRemoved: true,
        productName,
        reason,
        removedAt: new Date(),
        removedById: session.sub,
        restoredAt: null,
        restoredById: null,
        locationId: scope.locationId,
        locationName: scope.locationName,
      },
      select: { id: true, removedAt: true },
    })) as { id: string; removedAt: Date };

    await logActivity(
      session.sub,
      `inventory_count_row_remove ${auditDetail(scope, {
        exclusionId: row.id,
        productId,
        product: productName,
        reason,
      })}`,
    );

    return NextResponse.json({
      ok: true,
      data: {
        id: row.id,
        inventoryProductId: productId,
        productName,
        removedAt: row.removedAt.toISOString(),
        countDay: scope.countDay,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  if (!canRemoveCountRow(session.role)) {
    return NextResponse.json(
      { ok: false, error: "אין הרשאה לשחזר מוצר לספירה" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = req.nextUrl;
    const productId =
      searchParams.get("inventoryProductId")?.trim() || searchParams.get("productId")?.trim();
    if (!productId) {
      return NextResponse.json({ ok: false, error: "חסר מזהה מוצר" }, { status: 400 });
    }

    const resolved = await resolveScope({
      locationId: searchParams.get("locationId"),
      location: searchParams.get("location"),
      countDate: searchParams.get("countDate"),
    });
    if ("error" in resolved) return resolved.error;
    const { scope } = resolved;

    // Soft restore — השורה נשמרת עם isRemoved=false לתיעוד, לא נמחקת
    const updated = await prismaAny.inventoryCountExclusion.updateMany({
      where: {
        locationKey: scope.locationKey,
        inventoryProductId: productId,
        countDay: scope.countDay,
        isRemoved: true,
      },
      data: {
        isRemoved: false,
        restoredAt: new Date(),
        restoredById: session.sub,
      },
    });

    if (updated.count > 0) {
      await logActivity(
        session.sub,
        `inventory_count_row_restore ${auditDetail(scope, { productId })}`,
      );
    }

    return NextResponse.json({
      ok: true,
      data: { restored: updated.count, inventoryProductId: productId, countDay: scope.countDay },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
