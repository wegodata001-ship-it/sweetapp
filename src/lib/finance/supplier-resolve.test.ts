import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchExistingSupplier, supplierDisplayName } from "./supplier-resolve";

describe("supplier resolution", () => {
  const rows = [
    { id: "s1", name: "האני כעכ" },
    { id: "s2", name: "האני מזון" },
  ];

  it("treats surrounding spaces as the same supplier and does not merge similar names", () => {
    assert.equal(supplierDisplayName("  האני כעכ  "), "האני כעכ");
    assert.equal(matchExistingSupplier(rows, "האני כעכ ")?.id, "s1");
    assert.equal(matchExistingSupplier(rows, "  האני כעכ")?.id, "s1");
    assert.equal(matchExistingSupplier(rows, "האני מזון")?.id, "s2");
    assert.equal(matchExistingSupplier(rows, "האני"), null);
  });
});
