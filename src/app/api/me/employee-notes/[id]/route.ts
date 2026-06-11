import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import {
  completeEmployeeNote,
  countOpenEmployeeNotes,
  deleteEmployeeNote,
  getEmployeeNoteForUser,
  updateEmployeeNote,
} from "@/lib/employee-notes/employee-notes-service";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const note = await getEmployeeNoteForUser(session.sub, id);
  if (!note) {
    return NextResponse.json({ ok: false, error: "הודעה לא נמצאה" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, data: note });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      title?: string;
      content?: string | null;
      priority?: string;
      action?: string;
    };

    if (body.action === "complete") {
      const note = await completeEmployeeNote(session.sub, id);
      const openCount = await countOpenEmployeeNotes(session.sub);
      return NextResponse.json({ ok: true, data: { note, openCount } });
    }

    const note = await updateEmployeeNote(session.sub, id, {
      title: body.title,
      content: body.content,
      priority: body.priority as "NORMAL" | "HIGH" | "URGENT" | undefined,
    });
    const openCount = await countOpenEmployeeNotes(session.sub);
    return NextResponse.json({ ok: true, data: { note, openCount } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    const status = msg.includes("לא נמצא") ? 404 : msg.includes("כותרת") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const { id } = await ctx.params;
  try {
    await deleteEmployeeNote(session.sub, id);
    const openCount = await countOpenEmployeeNotes(session.sub);
    return NextResponse.json({ ok: true, data: { openCount } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: msg.includes("לא נמצא") ? 404 : 500 },
    );
  }
}
