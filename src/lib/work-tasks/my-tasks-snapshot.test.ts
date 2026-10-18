/**
 * Run: npx tsx --test src/lib/work-tasks/my-tasks-snapshot.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendTaskPage,
  decodeTaskPageCursor,
  encodeTaskPageCursor,
  myTasksFingerprint,
  replaceTaskById,
  statsAfterComplete,
  statsAfterStart,
  utcDayBounds,
} from "./my-tasks-snapshot";
import type { EmployeeTaskDayStats } from "@/lib/employee-experience/task-stats";
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

describe("task pages", () => {
  const baseStats: EmployeeTaskDayStats = {
    total: 121,
    completed: 4,
    pending: 100,
    inProgress: 1,
    lateWhileActive: 0,
    progressPct: 3,
    avgCompletedMinutes: 12,
  };

  it("walks 121 tasks without duplicates or gaps", () => {
    const all = Array.from({ length: 121 }, (_, i) => ({ id: `t${String(i).padStart(3, "0")}` }));
    const pageSize = 40;
    let seen: Array<{ id: string }> = [];
    for (let offset = 0; offset < all.length; offset += pageSize) {
      seen = appendTaskPage(seen, all.slice(offset, offset + pageSize));
    }
    assert.equal(seen.length, 121);
    assert.equal(new Set(seen.map((row) => row.id)).size, 121);
    assert.equal(seen[0]!.id, "t000");
    assert.equal(seen[120]!.id, "t120");
  });

  it("ignores a repeated id on the next page", () => {
    const merged = appendTaskPage(
      [{ id: "a" }, { id: "b" }],
      [{ id: "b" }, { id: "c" }],
    );
    assert.deepEqual(
      merged.map((row) => row.id),
      ["a", "b", "c"],
    );
  });

  it("round-trips a cursor and rejects a foreign shape", () => {
    const encoded = encodeTaskPageCursor({
      rank: 2,
      orderIndex: 4,
      createdAt: "2026-10-05T08:00:00.000Z",
      id: "task-1",
    });
    assert.deepEqual(decodeTaskPageCursor(encoded), {
      rank: 2,
      orderIndex: 4,
      createdAt: "2026-10-05T08:00:00.000Z",
      id: "task-1",
    });
    assert.equal(decodeTaskPageCursor("not-a-cursor"), null);
  });

  it("updates one task and keeps the rest", () => {
    const tasks = [
      task({ id: "a", status: "PENDING" }),
      task({ id: "b", status: "IN_PROGRESS" }),
      task({ id: "c", status: "PENDING" }),
    ];
    const started = replaceTaskById(tasks, { ...tasks[0]!, status: "IN_PROGRESS" });
    assert.deepEqual(
      started.map((row) => row.id),
      ["a", "b", "c"],
    );
    assert.equal(started[0]!.status, "IN_PROGRESS");
    assert.equal(started[2]!.status, "PENDING");
    const completed = replaceTaskById(started, { ...started[1]!, status: "COMPLETED" });
    assert.equal(completed.length, 3);
    assert.equal(completed[1]!.status, "COMPLETED");
    assert.equal(completed[0]!.status, "IN_PROGRESS");
    assert.equal(completed[2]!.status, "PENDING");
  });

  it("adjusts totals without dropping the open count of other tasks", () => {
    const afterStart = statsAfterStart(baseStats, "PENDING");
    assert.equal(afterStart.pending, 99);
    assert.equal(afterStart.inProgress, 2);
    assert.equal(afterStart.total, 121);
    const afterComplete = statsAfterComplete(afterStart, "IN_PROGRESS");
    assert.equal(afterComplete.completed, 5);
    assert.equal(afterComplete.inProgress, 1);
    assert.equal(afterComplete.total, 121);
    assert.equal(afterComplete.pending, 99);
  });
});

describe("utcDayBounds", () => {
  it("is a 24h UTC window from midnight", () => {
    const { start, end } = utcDayBounds(new Date("2026-10-05T15:30:00.000Z"));
    assert.equal(start.toISOString(), "2026-10-05T00:00:00.000Z");
    assert.equal(end.toISOString(), "2026-10-06T00:00:00.000Z");
  });
});
