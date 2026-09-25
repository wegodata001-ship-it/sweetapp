import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { activeTaskClockState, computeCountdownTimer } from "./countdown-timer";
import { formatTimerMs } from "./timer-display";

describe("my tasks active clock", () => {
  it("stays MM:SS with western digits", () => {
    for (const [ms, text] of [
      [5 * 60_000 + 38_000, "05:38"],
      [61_000, "01:01"],
      [59_000, "00:59"],
      [30_000, "00:30"],
      [5_000, "00:05"],
      [0, "00:00"],
    ] as const) {
      assert.equal(formatTimerMs(ms), text);
      assert.equal(/[٠-٩۰-۹]/.test(text), false);
    }
  });

  it("classifies the active-task clock without changing elapsed math", () => {
    assert.equal(activeTaskClockState(121_000, false), "normal");
    assert.equal(activeTaskClockState(120_000, false), "warning");
    assert.equal(activeTaskClockState(61_000, false), "warning");
    assert.equal(activeTaskClockState(60_000, false), "critical");
    assert.equal(activeTaskClockState(1_000, false), "critical");
    assert.equal(activeTaskClockState(0, false), "expired");
    assert.equal(activeTaskClockState(0, true), "overdue");

    const started = Date.parse("2026-09-25T10:00:00.000Z");
    const snap = computeCountdownTimer({
      estimatedMinutes: 6,
      startedAt: new Date(started).toISOString(),
      taskStatus: "IN_PROGRESS",
      nowMs: started + (6 * 60_000 + 15_000),
    });
    assert.equal(snap.display, "+00:15");
    assert.equal(snap.isOverdue, true);
  });

  it("does not rotate the timer text with the progress ring", () => {
    const css = readFileSync(new URL("./../../components/tasks/task-countdown-ring.module.css", import.meta.url), "utf8");
    const view = readFileSync(new URL("./../../components/tasks/task-countdown-ring.tsx", import.meta.url), "utf8");
    assert.equal(css.includes("ringVibrate"), false);
    assert.match(css, /\.activeFocus \.time\s*\{[^}]*writing-mode:\s*horizontal-tb/s);
    assert.match(css, /\.activeFocus \.time\s*\{[^}]*direction:\s*ltr/s);
    assert.match(css, /\.activeFocus \.time\s*\{[^}]*transform:\s*none/s);
    assert.doesNotMatch(css, /\.ringSvg\s*\{[^}]*rotate\(-90deg\)/s);
    assert.match(view, /<g transform="rotate\(-90 100 100\)">/);
    assert.match(css, /criticalRingGlow/);
    assert.match(css, /\.activeFocus\.state_critical \.ringProgress[\s\S]*animation:\s*criticalRingGlow/);
    assert.match(css, /\.activeFocus\.state_critical \.time[\s\S]*animation:\s*none/);
  });
});
