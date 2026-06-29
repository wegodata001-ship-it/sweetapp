import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { isReconCountry } from "@/lib/controls/reconciliation-constants";
import { parseExternalSpreadsheet } from "@/lib/controls/reconciliation-parse";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_EXT = ["xlsx", "xls", "csv"];

export async function POST(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;
  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const country = String(formData.get("country") || "").trim();
    const weekCode = String(formData.get("weekCode") || "").trim();
    const file = formData.get("file");

    if (!isReconCountry(country)) {
      return NextResponse.json({ ok: false, error: "מדינה לא תקינה" }, { status: 400 });
    }
    if (!weekCode) {
      return NextResponse.json({ ok: false, error: "חסר שבוע עבודה" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "קובץ לא תקין" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "הקובץ גדול מדי (מקסימום 15MB)" }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { ok: false, error: "סוג קובץ לא נתמך — xlsx, xls, csv בלבד" },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseExternalSpreadsheet(buffer);
    if (parsed.length === 0) {
      return NextResponse.json(
        { ok: false, error: "לא נמצאו שורות נתונים בקובץ" },
        { status: 400 },
      );
    }

    const created = await prisma.systemReconciliationImport.create({
      data: {
        country,
        weekCode,
        fileName: file.name,
        importedById: session.sub,
        totalRows: parsed.length,
        rows: {
          create: parsed.map((r) => ({
            country,
            weekCode: r.externalWeek?.trim() || weekCode,
            externalOrderId: r.externalOrderId,
            externalCustomerCode: r.externalCustomerCode,
            externalCustomerName: r.externalCustomerName,
            externalAmount: r.externalAmount,
            externalDate: r.externalDate,
            status: "PENDING",
          })),
        },
      },
      select: { id: true },
    });

    await logActivity(session.sub, `ייבוא התאמת מערכות (${country}/${weekCode}) — ${parsed.length} שורות`);

    return NextResponse.json({ ok: true, data: { id: created.id } });
  } catch (e) {
    console.error("[reconciliation import]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה בייבוא" },
      { status: 500 },
    );
  }
}
