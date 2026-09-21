import assert from "node:assert/strict";
import {
  calendarDayDiff,
  describeLateness,
  isEmployeeWorkTaskLate,
  lateDurationMs,
  lateReferenceAt,
  taskDeadlineAt,
} from "./completion";

const due = new Date("2026-09-18T00:00:00.000Z");
const completed = new Date("2026-09-20T00:00:00.000Z");
const today = new Date("2026-09-25T12:00:00.000Z").getTime();

assert.equal(calendarDayDiff(due, completed), 2);

assert.equal(
  lateDurationMs({
    targetDueAt: due,
    completedAt: completed,
    nowMs: today,
  }),
  completed.getTime() - due.getTime(),
);

const parts = describeLateness({
  targetDueAt: due,
  completedAt: completed,
  nowMs: today,
});
assert.equal(parts.unit, "days");
assert.equal(parts.value, 2);

assert.equal(
  isEmployeeWorkTaskLate({
    status: "COMPLETED",
    targetDueAt: due,
    completedAt: completed,
    nowMs: today,
  }),
  true,
);

const ref = lateReferenceAt({ completedAt: completed, nowMs: today });
assert.equal(ref.getTime(), completed.getTime());

const timerDeadline = taskDeadlineAt({
  startedAt: "2026-09-21T10:00:00.000Z",
  estimatedMinutes: 15,
});
assert.equal(timerDeadline?.toISOString(), "2026-09-21T10:15:00.000Z");

const onTime = describeLateness({
  startedAt: "2026-09-21T10:00:00.000Z",
  estimatedMinutes: 15,
  completedAt: "2026-09-21T10:10:00.000Z",
});
assert.equal(onTime.unit, "none");

console.log("completion.test.ts ok");
