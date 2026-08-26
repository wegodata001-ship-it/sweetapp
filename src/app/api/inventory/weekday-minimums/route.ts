import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canEditWeekdayMinimums } from "@/lib/inventory/count-access";
import { ensureLocationSchemaColumns } from "@/lib/inventory/ensure-location-schema";
import {
  bulkPatchWeekdayMinimums,
  loadWeekdayMinimumRows,
  type WeekdayMinimumPatchRow,
} from "@/lib/inventory/weekday-minimum-service";
import { WEEKDAY_MINIMUM_FIELDS } from "@/lib/inventory/weekday-minimum";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parsePatchBody(body: unknown): { locationId: string; rows: WeekdayMinimumPatchRow[] } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const locationId = typeof b.locationId === "string" ? b.locationId.trim() : "";
  if (!locationId) return null;
  if (!Array.isArray(b.rows)) return null;

  const rows: WeekdayMinimumPatchRow[] = [];
  for (const raw of b.rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const productId = typeof r.productId === "string" ? r.productId.trim() : "";
    if (!productId) continue;
    const row: WeekdayMinimumPatchRow = { productId };
    for (const field of WEEKDAY_MINIMUM_FIELDS) {
      if (field in r) row[field] = r[field] as number | null;
    }
    rows.push(row);
  }
  return { locationId, rows };
}

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const locationId = req.nextUrl.searchParams.get("locationId")?.trim() || "";
  if (!locationId) {
    return NextResponse.json({ ok: false, error: "חסר locationId" }, { status: 400 });
  }

  try {
    await ensureLocationSchemaColumns();
    const data = await loadWeekdayMinimumRows(locationId);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    if (msg === "LOCATION_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "מיקום לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }
  if (!canEditWeekdayMinimums(session.role)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = parsePatchBody(body);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
    }

    await ensureLocationSchemaColumns();
    const result = await bulkPatchWeekdayMinimums(parsed.locationId, parsed.rows);
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    if (msg === "LOCATION_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "מיקום לא נמצא" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
