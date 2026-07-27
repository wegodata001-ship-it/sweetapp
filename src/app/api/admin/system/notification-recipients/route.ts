import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { logActivity } from "@/lib/activity-log";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import { SYSTEM_ALERT_CATEGORIES } from "@/lib/notifications/alert-categories";
import {
  createSystemRecipient,
  listSystemRecipients,
} from "@/lib/notifications/system-recipients";

export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return { session: null, block: NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 }) };
  }
  return { session, block: null };
}

export async function GET() {
  const dbBlock = await requireDb();
  if (dbBlock) return dbBlock;
  const { block } = await requireManager();
  if (block) return block;

  try {
    const data = await listSystemRecipients();
    return NextResponse.json({ ok: true, data, categories: SYSTEM_ALERT_CATEGORIES });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const dbBlock = await requireDb();
  if (dbBlock) return dbBlock;
  const { session, block } = await requireManager();
  if (block || !session) return block;

  try {
    const body = (await req.json()) as {
      email?: string;
      label?: string | null;
      notes?: string | null;
      isActive?: boolean;
      allCategories?: boolean;
      categories?: unknown;
    };

    const result = await createSystemRecipient({
      email: body.email ?? "",
      label: body.label ?? null,
      notes: body.notes ?? null,
      isActive: body.isActive,
      allCategories: body.allCategories,
      categories: body.categories,
      createdById: session.sub ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    await logActivity(
      session.sub,
      `הוסיף נמען התראות מערכת: ${result.row.email}${
        result.row.allCategories ? " (כל ההתראות)" : ` (${result.row.categories.join(", ")})`
      }`,
    );

    return NextResponse.json({ ok: true, data: result.row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
