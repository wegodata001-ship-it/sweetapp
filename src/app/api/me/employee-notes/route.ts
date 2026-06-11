import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { requireDb } from "@/lib/api-route";
import {
  countOpenEmployeeNotes,
  createEmployeeNote,
  listEmployeeNotes,
} from "@/lib/employee-notes/employee-notes-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const block = await requireDb();
  if (block) return block;

  const session = await getSessionFromCookie();
  if (!session?.sub) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam === "completed" || statusParam === "all" ? statusParam : "open";
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const limit = preview ? 5 : 200;

  try {
    const [notes, openCount] = await Promise.all([
      listEmployeeNotes({ userId: session.sub, status, limit }),
      countOpenEmployeeNotes(session.sub),
    ]);
    return NextResponse.json({
      ok: true,
      data: { notes, openCount },
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
      title?: string;
      content?: string | null;
      priority?: string;
    };
    const note = await createEmployeeNote(session.sub, {
      title: body.title ?? "",
      content: body.content,
      priority: body.priority as "NORMAL" | "HIGH" | "URGENT" | undefined,
    });
    const openCount = await countOpenEmployeeNotes(session.sub);
    return NextResponse.json({ ok: true, data: { note, openCount } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    const status = msg.includes("כותרת") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
