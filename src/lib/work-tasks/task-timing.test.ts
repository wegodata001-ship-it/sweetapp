import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeSequenceLocks } from "./employee-work-lock";
import type { SerializedEmployeeTask } from "./serialize-employee-work";
import { TASK_BLOCK_REASONS, activeWorkMs, formatClockHms, isWorkLate } from "./task-timing";

function task(partial: Partial<SerializedEmployeeTask> & { id: string; order_index: number; status: string }): SerializedEmployeeTask {
  return {
    employee_id: "e",
    session_id: "s",
    task_group_id: null,
    task_template_id: null,
    title: partial.id,
    description: null,
    materials: null,
    target_due_at: null,
    estimated_minutes: 6,
    started_at: null,
    completed_at: null,
    delay_reason: null,
    delayed_at: null,
    late_reason: null,
    active_work_ms: 0,
    segment_started_at: null,
    color: null,
    created_at: "2026-09-25T00:00:00.000Z",
    ...partial,
  };
}

describe("employee task timing", () => {
  it("formats a real clock and keeps western digits", () => {
    assert.equal(formatClockHms((4 * 60 + 17) * 1000), "00:04:17");
    assert.equal(formatClockHms(6 * 60_000), "00:06:00");
    assert.equal(formatClockHms((8 * 60 + 34) * 1000), "00:08:34");
    assert.equal(formatClockHms((2 * 60 + 34) * 1000), "00:02:34");
    assert.equal(formatClockHms(7 * 60_000), "00:07:00");
  });

  it("counts only active segments, not the delay gap", () => {
    const start = Date.parse("2026-09-25T10:00:00.000Z");
    const delayAt = Date.parse("2026-09-25T10:03:00.000Z");
    const resumeAt = Date.parse("2026-09-25T10:15:00.000Z");
    const doneAt = Date.parse("2026-09-25T10:19:00.000Z");
    const closed = activeWorkMs({
      activeWorkMs: 0,
      segmentStartedAt: new Date(start).toISOString(),
      status: "IN_PROGRESS",
      nowMs: delayAt,
    });
    assert.equal(closed, 3 * 60_000);
    const finished = activeWorkMs({
      activeWorkMs: closed,
      segmentStartedAt: new Date(resumeAt).toISOString(),
      status: "IN_PROGRESS",
      nowMs: doneAt,
    });
    assert.equal(finished, 7 * 60_000);
    assert.equal(isWorkLate(finished, 6), true);
    assert.equal(isWorkLate((4 * 60 + 17) * 1000, 6), false);
  });

  it("lets the next task start after a delay and keeps the delayed task open", () => {
    const locks = computeSequenceLocks(
      [
        task({ id: "a", order_index: 0, status: "DELAYED", delay_reason: "MACHINE_BUSY" }),
        task({ id: "b", order_index: 1, status: "PENDING" }),
        task({ id: "c", order_index: 2, status: "PENDING" }),
      ],
      false,
    );
    assert.equal(locks.get("a")?.locked, false);
    assert.equal(locks.get("b")?.isNext, true);
    assert.equal(locks.get("c")?.locked, true);
    assert.equal(TASK_BLOCK_REASONS.length, 3);
  });
});
