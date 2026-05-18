import type { Prisma } from "@prisma/client";

/** HH:mm 24h */
export function parseHourMinute(s: string | null | undefined): { h: number; m: number } | null {
  if (!s?.trim()) return null;
  const parts = s.trim().split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const min = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/**
 * Local calendar date from yyyy-mm-dd + optional time.
 * `start`: day start or given time at :00.000
 * `end`: day end 23:59:59.999 or given time at :59.999
 */
export function combineLocalDateTime(
  ymd: string,
  timeStr: string | null | undefined,
  boundary: "start" | "end",
): Date | null {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, mo, d] = parts;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  const tm = parseHourMinute(timeStr ?? null);
  if (tm) {
    if (boundary === "end") {
      dt.setHours(tm.h, tm.m, 59, 999);
    } else {
      dt.setHours(tm.h, tm.m, 0, 0);
    }
  } else if (boundary === "end") {
    dt.setHours(23, 59, 59, 999);
  } else {
    dt.setHours(0, 0, 0, 0);
  }
  return dt;
}

export function todayYmdLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function yesterdayYmdLocal(): string {
  const n = new Date();
  n.setDate(n.getDate() - 1);
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Monday (local) of current week */
export function weekStartYmdLocal(): string {
  const now = new Date();
  const dow = now.getDay();
  const monOffset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(now);
  mon.setDate(now.getDate() + monOffset);
  const y = mon.getFullYear();
  const mo = String(mon.getMonth() + 1).padStart(2, "0");
  const d = String(mon.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

export function buildInventoryCountCreatedAtFilter(params: {
  dateFrom: string | null | undefined;
  dateTo: string | null | undefined;
  timeFrom: string | null | undefined;
  timeTo: string | null | undefined;
}): Prisma.DateTimeFilter | undefined {
  const df = params.dateFrom?.trim() || "";
  const dt = params.dateTo?.trim() || "";
  const tf = params.timeFrom?.trim() || "";
  const tt = params.timeTo?.trim() || "";

  let startYmd = df || dt;
  let endYmd = dt || df;

  if (!startYmd && !endYmd && (tf || tt)) {
    const t = todayYmdLocal();
    startYmd = t;
    endYmd = t;
  }

  if (!startYmd && !endYmd) return undefined;

  if (!startYmd) startYmd = endYmd;
  if (!endYmd) endYmd = startYmd;

  const gte = combineLocalDateTime(startYmd, tf || null, "start");
  const lte = combineLocalDateTime(endYmd, tt || null, "end");

  if (!gte || !lte) return undefined;
  if (gte.getTime() > lte.getTime()) {
    return { gte: lte, lte: gte };
  }
  return { gte, lte };
}
