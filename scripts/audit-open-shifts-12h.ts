/**
 * Read-only audit of open shifts older than 12 hours.
 * Pass --apply to close only those open rows at checkIn + 12h.
 * Already-closed historical shifts are not selected.
 */
import { prisma } from "../src/lib/prisma";
import {
  enforceMaxShiftLength,
  previewOpenShiftsOverMax,
} from "../src/lib/work-sessions/auto-checkout";

async function main() {
  const now = new Date();
  const preview = await previewOpenShiftsOverMax(now);
  const openRows = preview.map((row) => {
    const checkInMs = new Date(row.checkIn).getTime();
    const elapsedMinutes = Math.round((now.getTime() - checkInMs) / 60_000);
    const hh = Math.floor(elapsedMinutes / 60);
    const mm = elapsedMinutes % 60;
    return {
      employeeId: row.userId,
      employeeName: row.employeeName,
      shiftId: row.id,
      model: row.model,
      checkInAt: row.checkIn,
      currentElapsed: `${hh}:${String(mm).padStart(2, "0")}`,
      expectedAutoCheckout: row.newCheckout,
    };
  });
  console.log(JSON.stringify({ phase: "open_over_12h", count: openRows.length, rows: openRows }, null, 2));

  const closedSessions = await prisma.$queryRaw<
    Array<{
      employeeId: string;
      employeeName: string;
      shiftId: string;
      checkIn: Date;
      checkOut: Date;
      totalMinutes: number | null;
      checkoutType: string | null;
    }>
  >`
    SELECT w."userId" AS "employeeId",
           u."fullName" AS "employeeName",
           w.id AS "shiftId",
           w."clockIn" AS "checkIn",
           w."clockOut" AS "checkOut",
           w."totalMinutes",
           w."checkoutType"::text AS "checkoutType"
    FROM "WorkSession" w
    JOIN "User" u ON u.id = w."userId"
    WHERE w."clockOut" IS NOT NULL
      AND w."clockOut" > w."clockIn" + interval '12 hours'
    ORDER BY w."clockIn" DESC
  `;
  const closedAttendance = await prisma.$queryRaw<
    Array<{
      employeeId: string;
      employeeName: string;
      shiftId: string;
      checkIn: Date;
      checkOut: Date;
      workedMinutes: number | null;
      checkoutType: string | null;
    }>
  >`
    SELECT a."userId" AS "employeeId",
           u."fullName" AS "employeeName",
           a.id AS "shiftId",
           a."clockIn" AS "checkIn",
           a."clockOut" AS "checkOut",
           a."workedMinutes",
           a."checkoutType"::text AS "checkoutType"
    FROM "Attendance" a
    JOIN "User" u ON u.id = a."userId"
    WHERE a."clockOut" IS NOT NULL
      AND a."clockOut" > a."clockIn" + interval '12 hours'
    ORDER BY a."clockIn" DESC
  `;
  const propose = (checkIn: Date) => new Date(checkIn.getTime() + 12 * 60 * 60 * 1000).toISOString();
  console.log(
    JSON.stringify(
      {
        phase: "closed_over_12h_not_modified",
        workSessions: closedSessions.map((row) => ({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          shiftId: row.shiftId,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          durationMinutes: row.totalMinutes,
          checkoutType: row.checkoutType,
          proposedCheckOut: propose(row.checkIn),
          proposedDurationMinutes: 720,
        })),
        attendance: closedAttendance.map((row) => ({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          shiftId: row.shiftId,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
          durationMinutes: row.workedMinutes,
          checkoutType: row.checkoutType,
          proposedCheckOut: propose(row.checkIn),
          proposedDurationMinutes: 720,
        })),
      },
      null,
      2,
    ),
  );

  const counts = await prisma.$queryRaw<Array<{ sessions: bigint; openSessions: bigint; attendance: bigint }>>`
    SELECT
      (SELECT count(*) FROM "WorkSession") AS sessions,
      (SELECT count(*) FROM "WorkSession" WHERE status = 'ACTIVE' AND "clockOut" IS NULL) AS "openSessions",
      (SELECT count(*) FROM "Attendance") AS attendance
  `;
  const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('WorkSession', 'Attendance')
    ORDER BY tablename, indexname
  `;
  console.log(
    JSON.stringify(
      {
        phase: "size",
        sessions: Number(counts[0]?.sessions ?? 0),
        openSessions: Number(counts[0]?.openSessions ?? 0),
        attendance: Number(counts[0]?.attendance ?? 0),
        indexes,
      },
      null,
      2,
    ),
  );

  if (process.argv.includes("--apply")) {
    const applied = await enforceMaxShiftLength();
    console.log(
      JSON.stringify(
        {
          phase: "applied",
          count: applied.length,
          rows: applied,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
