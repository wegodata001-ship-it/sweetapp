import { NextRequest, NextResponse } from "next/server";
import { requireDb } from "@/lib/api-route";
import { logActivity } from "@/lib/activity-log";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { isManagerRole } from "@/lib/notifications/me-inbox";
import {
  deleteSystemRecipient,
  updateSystemRecipient,
} from "@/lib/notifications/system-recipients";

export const dynamic = "force-dynamic";

async function requireManager() {
  const session = await getSessionFromCookie();
  if (!session || (session.role !== "SUPER_ADMIN" && !isManagerRole(session.role))) {
    return {
      session: null,
      block: NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 }),
    };
  }
  return { session, block: null };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbBlock = await requireDb();
  if (dbBlock) return dbBlock;
  const { session, block } = await requireManager();
  if (block || !session) return block;

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      label?: string | null;
      notes?: string | null;
      isActive?: boolean;
      allCategories?: boolean;
      categories?: unknown;
    };

    const result = await updateSystemRecipient(id, body);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    const state = result.row.isActive ? "פעיל" : "כבוי";
    await logActivity(
      session.sub,
      `עדכן נמען התראות מערכת: ${result.row.email} (${state})`,
    );

    return NextResponse.json({ ok: true, data: result.row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const dbBlock = await requireDb();
  if (dbBlock) return dbBlock;
  const { session, block } = await requireManager();
  if (block || !session) return block;

  const { id } = await ctx.params;
  try {
    const result = await deleteSystemRecipient(id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    await logActivity(session.sub, `הסיר נמען התראות מערכת: ${result.email}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "שגיאה" },
      { status: 500 },
    );
  }
}
