import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import { parseCalendarDateToDbDate } from "@/lib/staff/work-date";

function normalizeHm(s: string): string | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get("from")?.trim();
  const to = req.nextUrl.searchParams.get("to")?.trim();
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "נדרש from ו־to (YYYY-MM-DD)" }, { status: 400 });
  }

  const dFrom = parseCalendarDateToDbDate(from);
  const dTo = parseCalendarDateToDbDate(to);
  if (!Number.isFinite(dFrom.getTime()) || !Number.isFinite(dTo.getTime())) {
    return NextResponse.json({ ok: false, error: "תאריכים לא תקינים" }, { status: 400 });
  }

  const rows = await prisma.workShift.findMany({
    where: { workDate: { gte: dFrom, lte: dTo } },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      user: r.user,
      workDate: r.workDate.toISOString().slice(0, 10),
      startTime: r.startTime,
      endTime: r.endTime,
      branch: r.branch,
      notes: r.notes,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const body = (await req.json()) as {
    userId?: string;
    workDate?: string;
    startTime?: string;
    endTime?: string;
    branch?: string | null;
    notes?: string | null;
    status?: string;
  };

  const userId = body.userId?.trim();
  const workDateStr = body.workDate?.trim();
  const st = body.startTime ? normalizeHm(body.startTime) : null;
  const en = body.endTime ? normalizeHm(body.endTime) : null;

  if (!userId || !workDateStr || !st || !en) {
    return NextResponse.json(
      { ok: false, error: "חובה: עובד, תאריך, שעת התחלה ושעת סיום" },
      { status: 400 },
    );
  }
  if (en <= st) {
    return NextResponse.json({ ok: false, error: "שעת סיום חייבת להיות אחרי ההתחלה" }, { status: 400 });
  }

  const workDate = parseCalendarDateToDbDate(workDateStr);
  if (!Number.isFinite(workDate.getTime())) {
    return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
  }

  const u = await prisma.user.findUnique({ where: { id: userId, isActive: true } });
  if (!u) {
    return NextResponse.json({ ok: false, error: "משתמש לא נמצא" }, { status: 400 });
  }

  const status = body.status === "cancelled" ? "cancelled" : "scheduled";

  const row = await prisma.workShift.create({
    data: {
      userId,
      workDate,
      startTime: st,
      endTime: en,
      branch: body.branch?.trim() || null,
      notes: body.notes?.trim() || null,
      status,
      createdById: session.sub,
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      userId: row.userId,
      user: row.user,
      workDate: row.workDate.toISOString().slice(0, 10),
      startTime: row.startTime,
      endTime: row.endTime,
      branch: row.branch,
      notes: row.notes,
      status: row.status,
    },
  });
}
