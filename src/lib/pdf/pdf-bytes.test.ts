import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPdfPayload } from "./pdf-bytes";

describe("pdf payload check", () => {
  it("accepts a real PDF header and rejects a JSON error body", () => {
    const pdf = new TextEncoder().encode("%PDF-1.4\n");
    const json = new TextEncoder().encode('{"statusCode":"429","error":"too_many_connections"}');
    assert.equal(isPdfPayload("application/pdf", pdf), true);
    assert.equal(isPdfPayload("application/json", json), false);
    assert.equal(isPdfPayload("application/pdf", json), false);
  });
});
