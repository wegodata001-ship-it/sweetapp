import { cappedOpenMinutes } from "@/lib/work-sessions/max-shift";

/**
 * DTOs for the multi-cycle work-session model.
 *
 * Designed so a client can render a refresh-safe live timer purely from
 * `clock_in` (absolute timestamp from server) — no DB pings per tick.
 */

export type WorkSessionStatus = "ACTIVE" | "ENDED" | "CANCELLED";

export type WorkSessionDto = {
  id: string;
  user_id: string;
  work_date: string; // YYYY-MM-DD (Israel)
  clock_in: string; // ISO
  clock_out: string | null; // ISO when ENDED
  total_minutes: number | null;
  status: WorkSessionStatus;
  checkout_type: "MANUAL" | "AUTO_12_HOURS" | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type WorkSessionRow = {
  id: string;
  userId: string;
  workDate: Date;
  clockIn: Date;
  clockOut: Date | null;
  totalMinutes: number | null;
  status: WorkSessionStatus;
  checkoutType?: "MANUAL" | "AUTO_12_HOURS" | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function ymd(d: Date): string {
  // Stored as UTC midnight by parseCalendarDateToDbDate — slice the iso prefix.
  return d.toISOString().slice(0, 10);
}

export function serializeWorkSession(row: WorkSessionRow): WorkSessionDto {
  return {
    id: row.id,
    user_id: row.userId,
    work_date: ymd(row.workDate),
    clock_in: row.clockIn.toISOString(),
    clock_out: row.clockOut ? row.clockOut.toISOString() : null,
    total_minutes: row.totalMinutes,
    status: row.status,
    checkout_type: row.checkoutType ?? null,
    note: row.note,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Minutes from clock-in to the stored clock-out, or a live value capped at 12 hours. */
export function elapsedMinutes(session: WorkSessionDto, nowMs: number = Date.now()): number {
  const start = new Date(session.clock_in).getTime();
  if (session.clock_out) {
    return Math.max(0, Math.floor((new Date(session.clock_out).getTime() - start) / 60_000));
  }
  return cappedOpenMinutes(start, nowMs);
}
