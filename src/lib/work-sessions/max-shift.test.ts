import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_SHIFT_MINUTES,
  MAX_SHIFT_MS,
  applyAutoCheckoutIfDue,
  autoCheckoutAt,
  prepareNewCheckIn,
  resolveCheckout,
  shiftWorkedMinutes,
  type OpenShiftRecord,
} from "./max-shift";

function at(iso: string): Date {
  return new Date(iso);
}

function openShift(clockIn: Date, id = "shift-1"): OpenShiftRecord {
  return {
    id,
    clockIn,
    clockOut: null,
    checkoutType: null,
    status: "ACTIVE",
  };
}

describe("12h max shift", () => {
  it("TEST 1 — manual checkout at 16:00 is 8 hours MANUAL", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const clockOutAt = at("2026-10-01T16:00:00.000Z");
    const resolved = resolveCheckout(clockIn, clockOutAt);
    assert.equal(resolved.checkoutType, "MANUAL");
    assert.equal(resolved.clockOut.toISOString(), clockOutAt.toISOString());
    assert.equal(resolved.totalMinutes, 8 * 60);
    assert.equal(shiftWorkedMinutes(clockIn, resolved.clockOut, clockOutAt), 8 * 60);
  });

  it("TEST 2 — no checkout by 20:00 closes at 12 hours AUTO_12_HOURS", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const now = at("2026-10-01T20:00:00.000Z");
    const shift = openShift(clockIn);
    assert.equal(applyAutoCheckoutIfDue(shift, now), true);
    assert.equal(shift.checkoutType, "AUTO_12_HOURS");
    assert.equal(shift.status, "ENDED");
    assert.equal(shift.clockOut?.toISOString(), "2026-10-01T20:00:00.000Z");
    assert.equal(shiftWorkedMinutes(clockIn, shift.clockOut, now), MAX_SHIFT_MINUTES);
  });

  it("TEST 3 — a check at 23:00 still writes checkout at 20:00", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const now = at("2026-10-01T23:00:00.000Z");
    const resolved = resolveCheckout(clockIn, now);
    assert.equal(resolved.checkoutType, "AUTO_12_HOURS");
    assert.equal(resolved.clockOut.toISOString(), "2026-10-01T20:00:00.000Z");
    assert.notEqual(resolved.clockOut.toISOString(), now.toISOString());
    assert.equal(resolved.clockOut.getTime() - clockIn.getTime(), MAX_SHIFT_MS);
    assert.equal(resolved.totalMinutes, 12 * 60);
  });

  it("TEST 4 — a shift left open for 30 hours closes at check-in + 12h", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const now = new Date(clockIn.getTime() + 30 * 60 * 60 * 1000);
    const shift = openShift(clockIn);
    assert.equal(applyAutoCheckoutIfDue(shift, now), true);
    assert.equal(shift.clockOut?.getTime(), clockIn.getTime() + MAX_SHIFT_MS);
    assert.equal(shiftWorkedMinutes(clockIn, shift.clockOut, now), 12 * 60);
    assert.ok(shiftWorkedMinutes(clockIn, shift.clockOut, now) < 30 * 60);
  });

  it("TEST 5 — after auto checkout a new check-in is allowed", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const now = at("2026-10-02T14:00:00.000Z");
    const previous = openShift(clockIn, "old");
    const gate = prepareNewCheckIn(previous, now);
    assert.equal(gate.allowed, true);
    assert.equal(gate.closedPrevious, true);
    assert.equal(previous.clockOut?.toISOString(), autoCheckoutAt(clockIn).toISOString());

    const next = openShift(now, "new");
    const blocked = prepareNewCheckIn(next, new Date(now.getTime() + 60 * 60 * 1000));
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.closedPrevious, false);
    assert.equal(next.status, "ACTIVE");
    assert.equal(next.clockOut, null);
  });

  it("TEST 6 — running auto checkout twice keeps a single checkout", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const now = at("2026-10-02T09:00:00.000Z");
    const shift = openShift(clockIn);
    assert.equal(applyAutoCheckoutIfDue(shift, now), true);
    const firstOut = shift.clockOut?.toISOString();
    assert.equal(applyAutoCheckoutIfDue(shift, now), false);
    assert.equal(applyAutoCheckoutIfDue(shift, new Date(now.getTime() + 5 * 60 * 60 * 1000)), false);
    assert.equal(shift.clockOut?.toISOString(), firstOut);
    assert.equal(shift.clockOut?.toISOString(), "2026-10-01T20:00:00.000Z");
    assert.equal(shift.checkoutType, "AUTO_12_HOURS");
  });

  it("does not rewrite a shift that was already closed manually", () => {
    const clockIn = at("2026-10-01T08:00:00.000Z");
    const manualOut = at("2026-10-01T16:00:00.000Z");
    const shift: OpenShiftRecord = {
      id: "closed",
      clockIn,
      clockOut: manualOut,
      checkoutType: "MANUAL",
      status: "ENDED",
    };
    assert.equal(applyAutoCheckoutIfDue(shift, at("2026-10-03T08:00:00.000Z")), false);
    assert.equal(shift.clockOut?.toISOString(), manualOut.toISOString());
    assert.equal(shift.checkoutType, "MANUAL");
  });

  it("12 hours is a fixed millisecond span across a DST fallback", () => {
    const clockIn = at("2026-10-24T22:30:00.000Z");
    const clockOut = autoCheckoutAt(clockIn);
    assert.equal(clockOut.getTime() - clockIn.getTime(), 12 * 60 * 60 * 1000);
  });
});
