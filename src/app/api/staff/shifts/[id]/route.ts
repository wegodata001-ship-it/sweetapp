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

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  const body = (await req.json()) as {
    workDate?: string;
    startTime?: string;
    endTime?: string;
    branch?: string | null;
    notes?: string | null;
    status?: string;
  };

  const data: {
    workDate?: Date;
    startTime?: string;
    endTime?: string;
    branch?: string | null;
    notes?: string | null;
    status?: string;
  } = {};

  if (body.workDate?.trim()) {
    const d = parseCalendarDateToDbDate(body.workDate.trim());
    if (!Number.isFinite(d.getTime())) {
      return NextResponse.json({ ok: false, error: "תאריך לא תקין" }, { status: 400 });
    }
    data.workDate = d;
  }
  if (body.startTime !== undefined) {
    const st = normalizeHm(body.startTime);
    if (!st) return NextResponse.json({ ok: false, error: "שעת התחלה לא תקינה" }, { status: 400 });
    data.startTime = st;
  }
  if (body.endTime !== undefined) {
    const en = normalizeHm(body.endTime);
    if (!en) return NextResponse.json({ ok: false, error: "שעת סיום לא תקינה" }, { status: 400 });
    data.endTime = en;
  }
  if (body.branch !== undefined) data.branch = body.branch?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.status === "cancelled" || body.status === "scheduled") data.status = body.status;

  try {
    const current = await prisma.workShift.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
    }
    const nextStart = data.startTime ?? current.startTime;
    const nextEnd = data.endTime ?? current.endTime;
    if (nextEnd <= nextStart) {
      return NextResponse.json({ ok: false, error: "שעת סיום חייבת להיות אחרי ההתחלה" }, { status: 400 });
    }

    const row = await prisma.workShift.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      ok: true,
      data: {
        id: row.id,
        workDate: row.workDate.toISOString().slice(0, 10),
        startTime: row.startTime,
        endTime: row.endTime,
        branch: row.branch,
        notes: row.notes,
        status: row.status,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await getSessionFromCookie();
  if (!session || !canManageAllTasks(session)) {
    return NextResponse.json({ ok: false, error: "אין הרשאה" }, { status: 403 });
  }

  try {
    await prisma.workShift.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }
}
