/**
 * Admin multi-device sessions.
 * Run: npx tsx --test src/lib/auth/session-binding.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionJwtPayload } from "@/lib/auth/jwt";
import {
  allowsMultipleAuthSessions,
  evaluateSessionBinding,
  isSidBound,
  parseActiveSessionIds,
  serializeActiveSessionIds,
  sessionIdsAfterLogin,
  sessionIdsAfterLogout,
} from "./session-binding";

function reasonOf(result: ReturnType<typeof evaluateSessionBinding>): string | undefined {
  return result.ok ? undefined : result.reason;
}

function payload(sid: string, role: SessionJwtPayload["role"] = "ADMIN"): SessionJwtPayload {
  return {
    sub: "admin-1",
    email: "admin@example.com",
    role,
    permissions: ["ledger", "admin"],
    sid,
  };
}

describe("1. ADMIN login device A → ACTIVE", () => {
  it("creates a single bound session", () => {
    const a = sessionIdsAfterLogin([], "sid-a", true);
    assert.deepEqual(a, ["sid-a"]);
    assert.equal(isSidBound(a, "sid-a"), true);
    const check = evaluateSessionBinding(payload("sid-a"), { sessionIds: a, isActive: true });
    assert.equal(check.ok, true);
  });
});

describe("2. ADMIN login device B → A + B ACTIVE", () => {
  it("keeps A when B logs in", () => {
    const afterA = sessionIdsAfterLogin([], "sid-a", true);
    const afterB = sessionIdsAfterLogin(afterA, "sid-b", true);
    assert.deepEqual(afterB, ["sid-a", "sid-b"]);
    assert.equal(isSidBound(afterB, "sid-a"), true);
    assert.equal(isSidBound(afterB, "sid-b"), true);
  });
});

describe("3. ADMIN login device C → A + B + C ACTIVE", () => {
  it("keeps all three", () => {
    let ids = sessionIdsAfterLogin([], "sid-a", true);
    ids = sessionIdsAfterLogin(ids, "sid-b", true);
    ids = sessionIdsAfterLogin(ids, "sid-c", true);
    assert.deepEqual(ids, ["sid-a", "sid-b", "sid-c"]);
    for (const sid of ["sid-a", "sid-b", "sid-c"]) {
      assert.equal(evaluateSessionBinding(payload(sid), { sessionIds: ids, isActive: true }).ok, true);
    }
  });
});

describe("4. ADMIN logout device B → B INVALID, A+C ACTIVE", () => {
  it("revokes only the current session", () => {
    const ids = sessionIdsAfterLogout(["sid-a", "sid-b", "sid-c"], "sid-b");
    assert.deepEqual(ids, ["sid-a", "sid-c"]);
    assert.equal(evaluateSessionBinding(payload("sid-b"), { sessionIds: ids, isActive: true }).ok, false);
    assert.equal(evaluateSessionBinding(payload("sid-a"), { sessionIds: ids, isActive: true }).ok, true);
    assert.equal(evaluateSessionBinding(payload("sid-c"), { sessionIds: ids, isActive: true }).ok, true);
  });
});

describe("5. ADMIN new login → existing sessions remain active", () => {
  it("does not replace the previous admin sid", () => {
    const afterNew = sessionIdsAfterLogin(["sid-a", "sid-b"], "sid-d", true);
    assert.equal(isSidBound(afterNew, "sid-a"), true);
    assert.equal(isSidBound(afterNew, "sid-b"), true);
    assert.equal(isSidBound(afterNew, "sid-d"), true);
  });
});

describe("6. ADMIN password reset → all previous sessions INVALID", () => {
  it("rotate replaces the whole set with one new sid", () => {
    const previous = ["sid-a", "sid-b", "sid-c"];
    const rotated = sessionIdsAfterLogin(previous, "sid-new", false);
    assert.deepEqual(rotated, ["sid-new"]);
    assert.equal(isSidBound(rotated, "sid-a"), false);
    assert.equal(isSidBound(rotated, "sid-b"), false);
    assert.equal(isSidBound(rotated, "sid-c"), false);
  });
});

describe("7. ADMIN force logout all → all sessions INVALID", () => {
  it("empty binding rejects every previous sid", () => {
    const ids: string[] = [];
    assert.equal(serializeActiveSessionIds(ids), null);
    assert.equal(reasonOf(evaluateSessionBinding(payload("sid-a"), { sessionIds: ids, isActive: true })), "superseded");
    assert.equal(reasonOf(evaluateSessionBinding(payload("sid-b"), { sessionIds: ids, isActive: true })), "superseded");
  });
});

describe("8. Unauthorized / expired token → rejected", () => {
  it("rejects missing, invalid, inactive, and unknown sid", () => {
    assert.equal(reasonOf(evaluateSessionBinding(null, { sessionIds: ["sid-a"], isActive: true })), "missing");
    assert.equal(
      reasonOf(evaluateSessionBinding({ ...payload(""), sid: "" }, { sessionIds: ["sid-a"], isActive: true })),
      "invalid",
    );
    assert.equal(
      reasonOf(evaluateSessionBinding(payload("sid-a"), { sessionIds: ["sid-a"], isActive: false })),
      "inactive",
    );
    assert.equal(
      reasonOf(evaluateSessionBinding(payload("expired-sid"), { sessionIds: ["sid-a"], isActive: true })),
      "superseded",
    );
  });
});

describe("9. Other user roles → existing single-session policy unchanged", () => {
  it("EMPLOYEE login replaces the previous sid", () => {
    assert.equal(allowsMultipleAuthSessions("EMPLOYEE"), false);
    assert.equal(allowsMultipleAuthSessions("ADMIN"), true);
    assert.equal(allowsMultipleAuthSessions("SUPER_ADMIN"), true);
    const after = sessionIdsAfterLogin(["old-sid"], "new-sid", allowsMultipleAuthSessions("EMPLOYEE"));
    assert.deepEqual(after, ["new-sid"]);
    assert.equal(isSidBound(after, "old-sid"), false);
  });
});

describe("10. Permissions remain identical across ADMIN sessions", () => {
  it("each session carries the same permission set from the user", () => {
    const permissions = ["ledger", "admin", "cash_flow"];
    const a = payload("sid-a");
    const b = payload("sid-b");
    a.permissions = permissions;
    b.permissions = [...permissions];
    const ids = ["sid-a", "sid-b"];
    const va = evaluateSessionBinding(a, { sessionIds: ids, isActive: true });
    const vb = evaluateSessionBinding(b, { sessionIds: ids, isActive: true });
    assert.equal(va.ok, true);
    assert.equal(vb.ok, true);
    if (va.ok && vb.ok) {
      assert.deepEqual(va.session.permissions, vb.session.permissions);
      assert.equal(va.session.role, vb.session.role);
      assert.equal(va.session.sub, vb.session.sub);
    }
  });
});

describe("storage encoding", () => {
  it("keeps a single UUID as a plain string for backward compatibility", () => {
    assert.equal(serializeActiveSessionIds(["only"]), "only");
    assert.deepEqual(parseActiveSessionIds("only"), ["only"]);
  });

  it("stores multiple IDs as JSON without a unique-user session table", () => {
    const raw = serializeActiveSessionIds(["a", "b"]);
    assert.equal(raw, JSON.stringify(["a", "b"]));
    assert.deepEqual(parseActiveSessionIds(raw), ["a", "b"]);
  });
});
