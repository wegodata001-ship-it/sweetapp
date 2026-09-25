/**
 * Hard cap on a single open shift.
 *
 * 12 hours is an absolute duration (12 * 60 * 60 * 1000 ms), not a local
 * clock-string or calendar-day calculation, so DST cannot stretch or shrink it.
 */

export const MAX_SHIFT_MS = 12 * 60 * 60 * 1000;
export const MAX_SHIFT_MINUTES = 12 * 60;

export type ShiftCheckoutType = "MANUAL" | "AUTO_12_HOURS";

export type ShiftCheckoutResolution = {
  clockOut: Date;
  checkoutType: ShiftCheckoutType;
  totalMinutes: number;
};

export function autoCheckoutAt(clockIn: Date): Date {
  return new Date(clockIn.getTime() + MAX_SHIFT_MS);
}

/** True when an open shift must be closed: now >= clockIn + 12h. */
export function isOpenShiftPastMax(clockIn: Date, now: Date): boolean {
  return now.getTime() >= clockIn.getTime() + MAX_SHIFT_MS;
}

/**
 * Checkout instant for an open shift.
 * Past the cap, clockOut is exactly clockIn + 12h (never "now").
 * Before the cap, a manual checkout uses `now`.
 */
export function resolveCheckout(clockIn: Date, now: Date): ShiftCheckoutResolution {
  if (isOpenShiftPastMax(clockIn, now)) {
    const clockOut = autoCheckoutAt(clockIn);
    return {
      clockOut,
      checkoutType: "AUTO_12_HOURS",
      totalMinutes: MAX_SHIFT_MINUTES,
    };
  }
  const totalMinutes = Math.max(0, Math.round((now.getTime() - clockIn.getTime()) / 60_000));
  return {
    clockOut: now,
    checkoutType: "MANUAL",
    totalMinutes,
  };
}

/** Live display for a still-open shift. Never exceeds 12:00. */
export function cappedOpenMinutes(clockInMs: number, nowMs: number): number {
  if (!Number.isFinite(clockInMs) || !Number.isFinite(nowMs)) return 0;
  const elapsed = Math.max(0, Math.floor((nowMs - clockInMs) / 60_000));
  return Math.min(elapsed, MAX_SHIFT_MINUTES);
}

/**
 * Payable minutes. Closed shifts use the stored clockOut.
 * Open shifts are capped at 12 hours until the backend writes that clockOut.
 */
export function shiftWorkedMinutes(clockIn: Date, clockOut: Date | null, now: Date): number {
  if (clockOut) {
    return Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000));
  }
  return cappedOpenMinutes(clockIn.getTime(), now.getTime());
}

export type OpenShiftRecord = {
  id: string;
  clockIn: Date;
  clockOut: Date | null;
  checkoutType: ShiftCheckoutType | null;
  status: "ACTIVE" | "ENDED" | "CANCELLED";
};

/**
 * In-memory stand-in for `UPDATE ... WHERE clockOut IS NULL AND status = 'ACTIVE'`.
 * A second call does not create another checkout or move clockOut.
 */
export function applyAutoCheckoutIfDue(shift: OpenShiftRecord, now: Date): boolean {
  if (shift.status !== "ACTIVE" || shift.clockOut !== null) return false;
  if (!isOpenShiftPastMax(shift.clockIn, now)) return false;
  const resolved = resolveCheckout(shift.clockIn, now);
  shift.clockOut = resolved.clockOut;
  shift.checkoutType = resolved.checkoutType;
  shift.status = "ENDED";
  return true;
}

/**
 * A new check-in is blocked only by a shift that is still inside the 12h window.
 * An older open shift is closed at clockIn + 12h first.
 */
export function prepareNewCheckIn(
  openShift: OpenShiftRecord | null,
  now: Date,
): { allowed: boolean; closedPrevious: boolean } {
  if (!openShift) return { allowed: true, closedPrevious: false };
  if (isOpenShiftPastMax(openShift.clockIn, now)) {
    const closedPrevious = applyAutoCheckoutIfDue(openShift, now);
    return { allowed: true, closedPrevious };
  }
  return { allowed: false, closedPrevious: false };
}
