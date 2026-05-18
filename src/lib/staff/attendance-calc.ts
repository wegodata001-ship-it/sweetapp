import type { WorkShift } from "@prisma/client";
import { hmToMinutes, minutesSinceMidnightIsrael } from "@/lib/staff/work-date";

export type ShiftLike = Pick<WorkShift, "startTime" | "endTime">;

export function diffMinutesClocked(clockIn: Date, clockOut: Date): number {
  return Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000));
}

export function computeLateOnClockIn(shift: ShiftLike | null, clockIn: Date): { isLate: boolean; lateMinutes: number } {
  if (!shift) return { isLate: false, lateMinutes: 0 };
  const sched = hmToMinutes(shift.startTime);
  if (sched === null) return { isLate: false, lateMinutes: 0 };
  const actual = minutesSinceMidnightIsrael(clockIn);
  const late = Math.max(0, actual - sched);
  return { isLate: late > 0, lateMinutes: late };
}

export function computeOvertimeOnClockOut(
  shift: ShiftLike | null,
  clockOut: Date,
): { hasOvertime: boolean; overtimeMinutes: number } {
  if (!shift) return { hasOvertime: false, overtimeMinutes: 0 };
  const end = hmToMinutes(shift.endTime);
  if (end === null) return { hasOvertime: false, overtimeMinutes: 0 };
  const actual = minutesSinceMidnightIsrael(clockOut);
  const ot = Math.max(0, actual - end);
  return { hasOvertime: ot > 0, overtimeMinutes: ot };
}
