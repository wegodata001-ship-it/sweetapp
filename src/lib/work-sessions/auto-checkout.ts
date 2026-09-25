import { prisma, prismaAny } from "@/lib/prisma";
import { notifyManagers } from "@/lib/notifications/dispatch";
import {
  MAX_SHIFT_MINUTES,
  autoCheckoutAt,
  isOpenShiftPastMax,
  resolveCheckout,
  type ShiftCheckoutType,
} from "@/lib/work-sessions/max-shift";

export type AutoCheckoutChange = {
  model: "WorkSession" | "Attendance";
  id: string;
  userId: string;
  employeeName: string;
  checkIn: string;
  oldCheckout: null;
  newCheckout: string;
  checkoutType: "AUTO_12_HOURS";
};

const AUTO_NOTIFY_HOURS = 24 * 365 * 5;
const AUTO_NOTIFY_LOOKBACK_MS = 36 * 60 * 60 * 1000;

function shouldNotifyAutoClose(clockOut: Date, now: Date): boolean {
  return now.getTime() - clockOut.getTime() <= AUTO_NOTIFY_LOOKBACK_MS;
}

type SessionRow = {
  id: string;
  userId: string;
  workDate: Date;
  clockIn: Date;
  clockOut: Date | null;
  note: string | null;
  status: string;
  user?: { fullName: string; employeeId: string | null };
};

function cutoff(now: Date): Date {
  return new Date(now.getTime() - 12 * 60 * 60 * 1000);
}

async function notifyAutoCheckout(userId: string, employeeName: string, dedupeId: string) {
  await notifyManagers(
    {
      type: "CLOCK_OUT",
      title: "יציאה אוטומטית",
      message: `המשמרת של ${employeeName} נסגרה אוטומטית לאחר 12 שעות.`,
      subjectUserId: userId,
      actionUrl: "/ops/team?tab=attendance",
      priority: "MEDIUM",
      metadata: { autoCheckoutId: dedupeId, source: "auto_12_hours" },
      dedupe: { metadataKey: "autoCheckoutId", sinceHours: AUTO_NOTIFY_HOURS },
    },
    { excludeUserId: userId },
  );
}

async function endEmployeeTaskSession(employeeId: string | null | undefined, clockOut: Date) {
  if (!employeeId) return;
  await prisma.employeeWorkSession.updateMany({
    where: { employeeId, status: "ACTIVE" },
    data: { endedAt: clockOut, status: "ENDED" },
  });
}

async function sumEndedSessionMinutes(userId: string, workDate: Date): Promise<number> {
  const rows = (await prismaAny.workSession.findMany({
    where: { userId, workDate, status: "ENDED" },
    select: { totalMinutes: true },
  })) as { totalMinutes: number | null }[];
  return rows.reduce((acc, row) => acc + (row.totalMinutes ?? 0), 0);
}

/**
 * Close one work session only while it is still open.
 * clockOut is clockIn + 12h, never the time the job happened to run.
 */
async function closeWorkSessionRow(
  row: SessionRow,
  now: Date,
  employeeName: string,
): Promise<AutoCheckoutChange[]> {
  if (row.clockOut || row.status !== "ACTIVE") return [];
  if (!isOpenShiftPastMax(row.clockIn, now)) return [];

  const resolved = resolveCheckout(row.clockIn, now);
  const updated = await prismaAny.workSession.updateMany({
    where: { id: row.id, clockOut: null, status: "ACTIVE" },
    data: {
      clockOut: resolved.clockOut,
      totalMinutes: resolved.totalMinutes,
      status: "ENDED",
      checkoutType: resolved.checkoutType,
    },
  });
  if (updated.count !== 1) return [];

  const written: AutoCheckoutChange[] = [
    {
      model: "WorkSession",
      id: row.id,
      userId: row.userId,
      employeeName,
      checkIn: row.clockIn.toISOString(),
      oldCheckout: null,
      newCheckout: resolved.clockOut.toISOString(),
      checkoutType: "AUTO_12_HOURS",
    },
  ];

  const employeeId = row.user?.employeeId;
  try {
    await endEmployeeTaskSession(employeeId, resolved.clockOut);
  } catch (error) {
    console.error("[auto-checkout] employee session", row.id, error);
  }

  try {
    const dailyMinutes = await sumEndedSessionMinutes(row.userId, row.workDate);
    const attendance = await prisma.attendance.findUnique({
      where: { userId_workDate: { userId: row.userId, workDate: row.workDate } },
      select: { id: true, clockIn: true, clockOut: true },
    });
    if (attendance && !attendance.clockOut) {
      const attendanceWrite = await prisma.attendance.updateMany({
        where: { id: attendance.id, clockOut: null },
        data: {
          clockOut: resolved.clockOut,
          workedMinutes: dailyMinutes,
          checkoutType: "AUTO_12_HOURS",
        },
      });
      if (attendanceWrite.count === 1) {
        written.push({
          model: "Attendance",
          id: attendance.id,
          userId: row.userId,
          employeeName,
          checkIn: attendance.clockIn.toISOString(),
          oldCheckout: null,
          newCheckout: resolved.clockOut.toISOString(),
          checkoutType: "AUTO_12_HOURS",
        });
      }
    }
  } catch (error) {
    console.error("[auto-checkout] attendance sync", row.id, error);
  }

  if (shouldNotifyAutoClose(resolved.clockOut, now)) {
    try {
      await notifyAutoCheckout(row.userId, employeeName, `session:${row.id}`);
    } catch (error) {
      console.error("[auto-checkout] notify", row.id, error);
    }
  }

  return written;
}

async function closeStaleAttendanceRow(
  row: {
    id: string;
    userId: string;
    workDate: Date;
    clockIn: Date;
    note: string | null;
    user: { fullName: string };
  },
  now: Date,
  alreadyNotifiedUserIds: Set<string>,
): Promise<AutoCheckoutChange | null> {
  if (!isOpenShiftPastMax(row.clockIn, now)) return null;

  const active = (await prismaAny.workSession.findFirst({
    where: { userId: row.userId, status: "ACTIVE", clockOut: null },
    select: { id: true, clockIn: true },
  })) as { id: string; clockIn: Date } | null;
  if (active) return null;

  const sameSession = (await prismaAny.workSession.findFirst({
    where: { userId: row.userId, clockIn: row.clockIn },
    select: { id: true, status: true, clockOut: true, checkoutType: true },
  })) as {
    id: string;
    status: string;
    clockOut: Date | null;
    checkoutType: ShiftCheckoutType | null;
  } | null;

  if (sameSession?.status === "ACTIVE") return null;

  if (sameSession?.clockOut) {
    const dailyMinutes = await sumEndedSessionMinutes(row.userId, row.workDate);
    await prisma.attendance.updateMany({
      where: { id: row.id, clockOut: null },
      data: {
        clockOut: sameSession.clockOut,
        workedMinutes: dailyMinutes,
        checkoutType: sameSession.checkoutType,
      },
    });
    return null;
  }

  const clockOut = autoCheckoutAt(row.clockIn);
  const claimed = await prisma.attendance.updateMany({
    where: { id: row.id, clockOut: null },
    data: {
      clockOut,
      workedMinutes: MAX_SHIFT_MINUTES,
      checkoutType: "AUTO_12_HOURS",
    },
  });
  if (claimed.count !== 1) return null;

  await prismaAny.workSession.create({
    data: {
      userId: row.userId,
      workDate: row.workDate,
      clockIn: row.clockIn,
      clockOut,
      totalMinutes: MAX_SHIFT_MINUTES,
      status: "ENDED",
      checkoutType: "AUTO_12_HOURS",
      note: row.note,
    },
  });
  const dailyMinutes = await sumEndedSessionMinutes(row.userId, row.workDate);
  if (dailyMinutes !== MAX_SHIFT_MINUTES) {
    await prisma.attendance.update({
      where: { id: row.id },
      data: { workedMinutes: dailyMinutes },
    });
  }

  if (!alreadyNotifiedUserIds.has(row.userId) && shouldNotifyAutoClose(clockOut, now)) {
    try {
      await notifyAutoCheckout(row.userId, row.user.fullName, `attendance:${row.id}`);
    } catch (error) {
      console.error("[auto-checkout] attendance notify", row.id, error);
    }
  }

  return {
    model: "Attendance",
    id: row.id,
    userId: row.userId,
    employeeName: row.user.fullName,
    checkIn: row.clockIn.toISOString(),
    oldCheckout: null,
    newCheckout: clockOut.toISOString(),
    checkoutType: "AUTO_12_HOURS",
  };
}

/**
 * Close every open shift that has reached 12 hours.
 * Safe to call repeatedly: updates require clockOut IS NULL.
 */
export async function enforceMaxShiftLength(options?: {
  userId?: string;
  now?: Date;
}): Promise<AutoCheckoutChange[]> {
  const now = options?.now ?? new Date();
  const userFilter = options?.userId ? { userId: options.userId } : {};
  const changes: AutoCheckoutChange[] = [];
  const notified = new Set<string>();

  const sessions = (await prismaAny.workSession.findMany({
    where: {
      ...userFilter,
      status: "ACTIVE",
      clockOut: null,
      clockIn: { lte: cutoff(now) },
    },
    include: { user: { select: { fullName: true, employeeId: true } } },
  })) as SessionRow[];

  for (const row of sessions) {
    try {
      const closed = await closeWorkSessionRow(row, now, row.user?.fullName ?? "עובד");
      if (closed.length > 0) {
        changes.push(...closed);
        notified.add(row.userId);
      }
    } catch (error) {
      console.error("[auto-checkout] session", row.id, error);
    }
  }

  const openAttendance = await prisma.attendance.findMany({
    where: {
      ...userFilter,
      clockOut: null,
      clockIn: { lte: cutoff(now) },
    },
    include: { user: { select: { fullName: true } } },
  });

  for (const row of openAttendance) {
    try {
      const change = await closeStaleAttendanceRow(row, now, notified);
      if (change) changes.push(change);
    } catch (error) {
      console.error("[auto-checkout] attendance", row.id, error);
    }
  }

  return changes;
}

/**
 * Atomic checkout of one still-open work session.
 * Past 12 hours, clockOut is clockIn + 12h. A second call does not write.
 */
export async function claimWorkSessionCheckout(input: {
  sessionId: string;
  clockIn: Date;
  now: Date;
  note: string | null;
}): Promise<{
  claimed: boolean;
  clockOut: Date;
  checkoutType: ShiftCheckoutType;
  totalMinutes: number;
}> {
  const resolved = resolveCheckout(input.clockIn, input.now);
  const updated = await prismaAny.workSession.updateMany({
    where: { id: input.sessionId, clockOut: null, status: "ACTIVE" },
    data: {
      clockOut: resolved.clockOut,
      totalMinutes: resolved.totalMinutes,
      status: "ENDED",
      checkoutType: resolved.checkoutType,
      note: input.note,
    },
  });
  return { claimed: updated.count === 1, ...resolved };
}

/** Read-only list of open shifts that the 12h rule would close. Does not write. */
export async function previewOpenShiftsOverMax(now = new Date()): Promise<AutoCheckoutChange[]> {
  const sessions = (await prismaAny.workSession.findMany({
    where: { status: "ACTIVE", clockOut: null, clockIn: { lte: cutoff(now) } },
    include: { user: { select: { fullName: true } } },
  })) as SessionRow[];

  const freshSessions = (await prismaAny.workSession.findMany({
    where: { status: "ACTIVE", clockOut: null, clockIn: { gt: cutoff(now) } },
    select: { userId: true },
  })) as { userId: string }[];
  const freshUserIds = new Set(freshSessions.map((row) => row.userId));

  const attendance = await prisma.attendance.findMany({
    where: { clockOut: null, clockIn: { lte: cutoff(now) } },
    include: { user: { select: { fullName: true } } },
  });

  const fromSessions: AutoCheckoutChange[] = sessions
    .filter((row) => isOpenShiftPastMax(row.clockIn, now))
    .map((row) => ({
      model: "WorkSession" as const,
      id: row.id,
      userId: row.userId,
      employeeName: row.user?.fullName ?? "",
      checkIn: row.clockIn.toISOString(),
      oldCheckout: null,
      newCheckout: autoCheckoutAt(row.clockIn).toISOString(),
      checkoutType: "AUTO_12_HOURS" as const,
    }));

  const sessionUserIds = new Set(fromSessions.map((row) => row.userId));
  const fromAttendance: AutoCheckoutChange[] = attendance
    .filter(
      (row) =>
        isOpenShiftPastMax(row.clockIn, now) &&
        !sessionUserIds.has(row.userId) &&
        !freshUserIds.has(row.userId),
    )
    .map((row) => ({
      model: "Attendance" as const,
      id: row.id,
      userId: row.userId,
      employeeName: row.user.fullName,
      checkIn: row.clockIn.toISOString(),
      oldCheckout: null,
      newCheckout: autoCheckoutAt(row.clockIn).toISOString(),
      checkoutType: "AUTO_12_HOURS" as const,
    }));

  return [...fromSessions, ...fromAttendance];
}
