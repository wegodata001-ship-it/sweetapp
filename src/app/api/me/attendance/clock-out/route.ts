import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import {
  computeOvertimeOnClockOut,
  diffMinutesClocked,
} from "@/lib/staff/attendance-calc";
import { israelCalendarDateString, parseCalendarDateToDbDate } from "@/lib/staff/work-date";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { note?: string };
  const noteExtra = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

  const workDateStr = israelCalendarDateString();
  const workDate = parseCalendarDateToDbDate(workDateStr);

  const existing = await prisma.attendance.findUnique({
    where: { userId_workDate: { userId: session.sub, workDate } },
    include: { shift: true },
  });
  if (!existing || existing.clockOut) {
    return NextResponse.json(
      { ok: false, error: "אין משמרת פתוחה לסיום" },
      { status: 400 },
    );
  }

  const clockOut = new Date();
  const workedMinutes = diffMinutesClocked(existing.clockIn, clockOut);
  const shiftLike = existing.shift;
  const ot = computeOvertimeOnClockOut(shiftLike, clockOut);

  const mergedNote = [existing.note, noteExtra].filter(Boolean).join(" — ") || null;

  const updated = await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      clockOut,
      workedMinutes,
      overtimeMinutes: ot.overtimeMinutes,
      hasOvertime: ot.hasOvertime,
      note: mergedNote,
    },
    include: { shift: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { fullName: true },
  });

  if (ot.hasOvertime) {
    const name = user?.fullName ?? "עובד";
    const ids = await listStaffAlertRecipientIds();
    const filtered = ids.filter((id) => id !== session.sub);
    if (filtered.length) {
      await notifyAdminRecipients(filtered, {
        type: "OVERTIME",
        title: `חריגת שעות — ${name}`,
        message: `${name} — חריגה של ${ot.overtimeMinutes} דקות`,
        color: toneToColor("WARNING"),
        subjectUserId: session.sub,
        metadata: { attendanceId: updated.id, source: "attendance" },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: updated.id,
      clockOut: updated.clockOut!.toISOString(),
      workedMinutes: updated.workedMinutes,
      overtimeMinutes: updated.overtimeMinutes,
      hasOvertime: updated.hasOvertime,
    },
  });
}
