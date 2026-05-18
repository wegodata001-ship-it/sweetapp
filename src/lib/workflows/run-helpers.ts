import type { WorkflowItemStatus, WorkflowRunStatus } from "@/lib/workflows/serialize";

/**
 * Helper utilities for workflow runs — purely functional, no DB access.
 *
 * Timer math always derives from absolute timestamps so refreshing the page or
 * switching device keeps the same elapsed/remaining values. The server is the
 * single source of truth for `startedAt` / `completedAt`.
 */

/** Compute elapsed milliseconds for an item (or null when not started). */
export function itemElapsedMs(
  startedAt: Date | string | null,
  completedAt: Date | string | null,
  nowMs: number = Date.now(),
): number | null {
  if (!startedAt) return null;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const endMs = completedAt ? new Date(completedAt).getTime() : nowMs;
  return Math.max(0, endMs - startMs);
}

/** True if the item is taking longer than its estimated minutes. */
export function itemIsLate(
  estimatedMinutes: number,
  startedAt: Date | string | null,
  completedAt: Date | string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!estimatedMinutes || estimatedMinutes <= 0) return false;
  const elapsed = itemElapsedMs(startedAt, completedAt, nowMs);
  if (elapsed == null) return false;
  return elapsed > estimatedMinutes * 60_000;
}

/** Round elapsed ms to integer minutes (used to snapshot actualMinutes). */
export function elapsedMinutes(
  startedAt: Date | string,
  completedAt: Date | string,
): number {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

/**
 * Compute the next runtime status of a run after an item changed.
 *
 * Rules:
 *  - All items COMPLETED/SKIPPED → run is COMPLETED.
 *  - One item ACTIVE → IN_PROGRESS.
 *  - Otherwise → IN_PROGRESS (waiting on next start).
 */
export function computeRunStatus(
  items: { status: WorkflowItemStatus }[],
): WorkflowRunStatus {
  if (items.length === 0) return "IN_PROGRESS";
  const allDone = items.every(
    (i) => i.status === "COMPLETED" || i.status === "SKIPPED",
  );
  if (allDone) return "COMPLETED";
  return "IN_PROGRESS";
}

/**
 * Validate that the request to start an item is allowed:
 *  - Run must be IN_PROGRESS.
 *  - No other item may be ACTIVE.
 *  - All earlier items must be COMPLETED or SKIPPED.
 *  - The target item must currently be PENDING.
 */
export function canStartItem(
  items: { id: string; status: WorkflowItemStatus; orderIndex: number }[],
  targetId: string,
  runStatus: WorkflowRunStatus,
): { ok: true } | { ok: false; reason: string } {
  if (runStatus !== "IN_PROGRESS") {
    return { ok: false, reason: "RUN_NOT_IN_PROGRESS" };
  }
  const target = items.find((i) => i.id === targetId);
  if (!target) return { ok: false, reason: "ITEM_NOT_FOUND" };
  if (target.status !== "PENDING") {
    return { ok: false, reason: "ITEM_NOT_PENDING" };
  }
  const active = items.find((i) => i.status === "ACTIVE");
  if (active) return { ok: false, reason: "ANOTHER_ITEM_ACTIVE" };

  // Sequential gating — earlier items must be done.
  const earlierUnfinished = items.find(
    (i) => i.orderIndex < target.orderIndex && i.status !== "COMPLETED" && i.status !== "SKIPPED",
  );
  if (earlierUnfinished) return { ok: false, reason: "EARLIER_ITEM_UNFINISHED" };

  return { ok: true };
}
