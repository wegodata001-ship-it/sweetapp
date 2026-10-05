/**
 * Run: npx tsx --test src/lib/work-tasks/my-tasks-snapshot.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { myTasksFingerprint, utcDayBounds } from "./my-tasks-snapshot";
import type { SerializedWorkEmployeeTask } from "./serialize-work-task";

function task(partial: Partial<SerializedWorkEmployeeTask>): SerializedWorkEmployeeTask {
  return {
    id: "t1",
    employee_id: "e1",
    session_id: "s1",
    task_template_id: null,
    title: "Task",
    description: null,
    estimated_minutes: 15,
    started_at: null,
    completed_at: null,
    status: "PENDING",
    delay_reason: null,
    delayed_at: null,
    late_reason: null,
    active_work_ms: 0,
    segment_started_at: null,
    order_index: 0,
    created_at: "2026-10-05T00:00:00.000Z",
    target_due_at: null,
    ...partial,
  };
}

describe("myTasksFingerprint", () => {
  it("is stable when poll returns the same task state", () => {
    const a = [task({ id: "a", status: "IN_PROGRESS", started_at: "2026-10-05T08:00:00.000Z" })];
    const b = [task({ id: "a", status: "IN_PROGRESS", started_at: "2026-10-05T08:00:00.000Z" })];
    assert.equal(myTasksFingerprint(a), myTasksFingerprint(b));
  });

  it("changes when a task starts", () => {
    const before = [task({ id: "a", status: "PENDING" })];
    const after = [task({ id: "a", status: "IN_PROGRESS", started_at: "2026-10-05T08:00:00.000Z" })];
    assert.notEqual(myTasksFingerprint(before), myTasksFingerprint(after));
  });
});

describe("utcDayBounds", () => {
  it("is a 24h UTC window from midnight", () => {
    const { start, end } = utcDayBounds(new Date("2026-10-05T15:30:00.000Z"));
    assert.equal(start.toISOString(), "2026-10-05T00:00:00.000Z");
    assert.equal(end.toISOString(), "2026-10-06T00:00:00.000Z");
  });
});
