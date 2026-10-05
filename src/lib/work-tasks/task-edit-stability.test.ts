/**
 * Run: npx tsx --test src/lib/work-tasks/task-edit-stability.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTaskDueInput,
  shouldFetchTaskDetail,
  shouldInitTaskEditForm,
} from "./task-edit-stability";

describe("shouldInitTaskEditForm", () => {
  it("inits once when the same task is opened", () => {
    assert.equal(shouldInitTaskEditForm(true, "t1", null), true);
    assert.equal(shouldInitTaskEditForm(true, "t1", "t1"), false);
  });

  it("does not init while closed even if the parent recreates the task object", () => {
    assert.equal(shouldInitTaskEditForm(false, "t1", "t1"), false);
    assert.equal(shouldInitTaskEditForm(false, "t1", null), false);
  });

  it("re-inits only when the task id changes", () => {
    assert.equal(shouldInitTaskEditForm(true, "t2", "t1"), true);
  });

  it("20x open/close inits once per open, and parent re-renders do not re-init", () => {
    let inits = 0;
    for (let i = 0; i < 20; i += 1) {
      let last: string | null = null;
      if (shouldInitTaskEditForm(true, "t1", last)) {
        inits += 1;
        last = "t1";
      }
      for (let r = 0; r < 5; r += 1) {
        assert.equal(shouldInitTaskEditForm(true, "t1", last), false);
      }
    }
    assert.equal(inits, 20);
  });
});

describe("shouldFetchTaskDetail", () => {
  it("does not fetch when the card already has data", () => {
    assert.equal(shouldFetchTaskDetail({ id: "t1", hasData: true, inFlightId: null }), false);
  });

  it("does not start a second in-flight request for the same id", () => {
    assert.equal(shouldFetchTaskDetail({ id: "t1", hasData: false, inFlightId: "t1" }), false);
  });

  it("fetches once when data is missing", () => {
    assert.equal(shouldFetchTaskDetail({ id: "t1", hasData: false, inFlightId: null }), true);
  });

  it("50 repeated open-edit checks never start a second GET once data or in-flight exists", () => {
    let fetches = 0;
    let inFlight: string | null = null;
    let hasData = false;
    for (let i = 0; i < 50; i += 1) {
      if (shouldFetchTaskDetail({ id: "t1", hasData, inFlightId: inFlight })) {
        fetches += 1;
        inFlight = "t1";
        hasData = true;
        inFlight = null;
      }
    }
    assert.equal(fetches, 1);
  });
});

describe("formatTaskDueInput", () => {
  it("returns empty for missing or invalid dates instead of throwing", () => {
    assert.equal(formatTaskDueInput(null), "");
    assert.equal(formatTaskDueInput("not-a-date"), "");
  });
});
