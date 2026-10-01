import { diffUnknown } from "@/lib/dashboard/compare-fields";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("dashboard compare", () => {
  it("treats equal financial objects as zero diffs", () => {
    assert.deepEqual(diffUnknown({ a: 1.0000001, b: [1, 2] }, { a: 1, b: [1, 2] }), []);
  });

  it("reports a changed field", () => {
    const diffs = diffUnknown({ income: 10 }, { income: 11 });
    assert.equal(diffs.length, 1);
  });
});
