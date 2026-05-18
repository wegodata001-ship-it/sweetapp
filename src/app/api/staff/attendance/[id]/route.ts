import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookie } from "@/lib/auth/get-session";
import { canManageAllTasks } from "@/lib/tasks/task-access";
import {
  computeLateOnClockIn,
  computeOvertimeOnClockOut,
  diffMinutesClocked,
} from "@/lib/staff/attendance-calc";

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
    clockIn?: string;
    clockOut?: string | null;
    shiftId?: string | null;
    note?: string | null;
  };

  const existing = await prisma.attendance.findUnique({
    where: { id },
    include: { shift: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "לא נמצא" }, { status: 404 });
  }

  let clockIn = existing.clockIn;
  let clockOut = existing.clockOut;
  let shiftId = existing.shiftId;
  let note = existing.note;

  if (body.clockIn !== undefined) {
    const d = new Date(body.clockIn);
    if (!Number.isFinite(d.getTime())) {
      return NextResponse.json({ ok: false, error: "clockIn לא תקין" }, { status: 400 });
    }
    clockIn = d;
  }
  if (body.clockOut !== undefined) {
    if (body.clockOut === null || body.clockOut === "") {
      clockOut = null;
    } else {
      const d = new Date(body.clockOut);
      if (!Number.isFinite(d.getTime())) {
        return NextResponse.json({ ok: false, error: "clockOut לא תקין" }, { status: 400 });
      }
      clockOut = d;
    }
  }
  if (body.shiftId !== undefined) {
    shiftId = body.shiftId;
  }
  if (body.note !== undefined) {
    note = body.note?.trim() || null;
  }

  const linkedShift =
    shiftId ?
      await prisma.workShift.findUnique({ where: { id: shiftId } })
    : null;

  const late = computeLateOnClockIn(linkedShift, clockIn);
  let workedMinutes: number | null = null;
  let overtimeMinutes = 0;
  let hasOvertime = false;
  if (clockOut) {
    workedMinutes = diffMinutesClocked(clockIn, clockOut);
    const ot = computeOvertimeOnClockOut(linkedShift, clockOut);
    overtimeMinutes = ot.overtimeMinutes;
    hasOvertime = ot.hasOvertime;
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const snap = (v: unknown) =>
    v instanceof Date ? v.toISOString()
    : v === null ? null
    : v;
  if (body.clockIn !== undefined && existing.clockIn.getTime() !== clockIn.getTime()) {
    changes.clockIn = { from: existing.clockIn.toISOString(), to: clockIn.toISOString() };
  }
  if (body.clockOut !== undefined) {
    const prev = existing.clockOut?.toISOString() ?? null;
    const next = clockOut?.toISOString() ?? null;
    if (prev !== next) changes.clockOut = { from: prev, to: next };
  }
  if (body.shiftId !== undefined && existing.shiftId !== shiftId) {
    changes.shiftId = { from: existing.shiftId, to: shiftId };
  }
  if (body.note !== undefined && existing.note !== note) {
    changes.note = { from: existing.note, to: note };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.attendance.update({
      where: { id },
      data: {
        clockIn,
        clockOut,
        shiftId,
        note,
        workedMinutes,
        lateMinutes: late.lateMinutes,
        isLate: late.isLate,
        overtimeMinutes,
        hasOvertime,
      },
      include: { shift: true, user: { select: { fullName: true, hourlyRate: true } } },
    });

    if (Object.keys(changes).length > 0) {
      await tx.attendanceEditLog.create({
        data: {
          attendanceId: id,
          editorId: session.sub,
          changes: changes as Prisma.InputJsonValue,
        },
      });
    }

    return row;
  });

  return NextResponse.json({
    ok: true,
    data: {
      id: updated.id,
      clockIn: updated.clockIn.toISOString(),
      clockOut: updated.clockOut?.toISOString() ?? null,
      workedMinutes: updated.workedMinutes,
      lateMinutes: updated.lateMinutes,
      overtimeMinutes: updated.overtimeMinutes,
      isLate: updated.isLate,
      hasOvertime: updated.hasOvertime,
    },
  });
}
