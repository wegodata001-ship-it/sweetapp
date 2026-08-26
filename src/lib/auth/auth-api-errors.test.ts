import assert from "node:assert/strict";
import {
  AUTH_API_CODES,
  isInfrastructureError,
} from "./auth-api-errors";

assert.equal(isInfrastructureError(new Error("Environment variable not found: DATABASE_URL")), true);
assert.equal(
  isInfrastructureError(new Error("Invalid `prisma.user.count()` invocation")),
  true,
);
assert.equal(isInfrastructureError(new Error("פרטי התחברות שגויים")), false);

assert.equal(AUTH_API_CODES.INVALID_CREDENTIALS, "INVALID_CREDENTIALS");
assert.equal(AUTH_API_CODES.SYSTEM_ERROR, "SYSTEM_ERROR");

console.log("auth-api-errors.test.ts: OK");
