import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { listStaffAlertRecipientIds } from "@/lib/staff/notify-managers";
import { notifyAdminRecipients, toneToColor } from "@/lib/notifications/dispatch";
import {
  computeEarlyLeaveOnClockOut,
  computeOvertimeOnClockOut,
} from "@/lib/staff/attendance-calc";
import { israelCalendarDateString, parseCalendarDateToDbDate } from "@/lib/staff/work-date";
import { notifyEarlyClockOut } from "@/lib/notifications/checkMissedAttendance";
import { notifyManagers } from "@/lib/notifications/dispatch";
import { resolveCheckout } from "@/lib/work-sessions/max-shift";

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

  const now = new Date();
  const resolved = resolveCheckout(existing.clockIn, now);
  const clockOut = resolved.clockOut;
  const workedMinutes = resolved.totalMinutes;
  const shiftLike = existing.shift;
  const ot = computeOvertimeOnClockOut(shiftLike, clockOut);

  const mergedNote = [existing.note, noteExtra].filter(Boolean).join(" — ") || null;

  const claimed = await prisma.attendance.updateMany({
    where: { id: existing.id, clockOut: null },
    data: {
      clockOut,
      workedMinutes,
      overtimeMinutes: ot.overtimeMinutes,
      hasOvertime: ot.hasOvertime,
      note: mergedNote,
      checkoutType: resolved.checkoutType,
    },
  });
  if (claimed.count !== 1) {
    return NextResponse.json(
      { ok: false, error: "אין משמרת פתוחה לסיום" },
      { status: 400 },
    );
  }
  const updated = await prisma.attendance.findUniqueOrThrow({
    where: { id: existing.id },
    include: { shift: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { fullName: true },
  });

  if (resolved.checkoutType === "AUTO_12_HOURS") {
    await notifyManagers(
      {
        type: "CLOCK_OUT",
        title: "יציאה אוטומטית",
        message: `המשמרת של ${user?.fullName ?? "עובד"} נסגרה אוטומטית לאחר 12 שעות.`,
        subjectUserId: session.sub,
        actionUrl: "/ops/team?tab=attendance",
        priority: "MEDIUM",
        metadata: { autoCheckoutId: `attendance:${updated.id}`, source: "auto_12_hours" },
        dedupe: { metadataKey: "autoCheckoutId", sinceHours: 24 * 365 * 5 },
      },
      { excludeUserId: session.sub },
    );
  } else if (ot.hasOvertime) {
    const name = user?.fullName ?? "עובד";
    const ids = await listStaffAlertRecipientIds();
    const filtered = ids.filter((id) => id !== session.sub);
    if (filtered.length) {
      await notifyAdminRecipients(filtered, {
        type: "OVERTIME",
        title: `חריגת שעות — ${name}`,
        message: `${name} — חריגה של ${ot.overtimeMinutes} דקות`,
        color: toneToColor("WARNING"),
        priority: "MEDIUM",
        subjectUserId: session.sub,
        metadata: { attendanceId: updated.id, source: "attendance" },
      });
    }
  } else if (shiftLike) {
    const early = computeEarlyLeaveOnClockOut(shiftLike, clockOut);
    if (early.isEarlyLeave) {
      await notifyEarlyClockOut({
        userId: session.sub,
        userName: user?.fullName ?? "עובד",
        earlyMinutes: early.earlyMinutes,
        shiftEndTime: shiftLike.endTime,
        workDate: workDateStr,
        attendanceId: updated.id,
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
