/**
 * Run: npx tsx --test src/lib/prisma-db-health.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeDatabaseUrl } from "./prisma-db-health";

describe("normalizeDatabaseUrl", () => {
  it("caps each serverless client at one pooler connection", () => {
    const url = normalizeDatabaseUrl("postgresql://u:p@db.pooler.supabase.com:6543/postgres");
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("pgbouncer"), "true");
    assert.equal(parsed.searchParams.get("connection_limit"), "1");
  });

  it("does not override an explicit connection_limit", () => {
    const url = normalizeDatabaseUrl(
      "postgresql://u:p@db.pooler.supabase.com:6543/postgres?connection_limit=2",
    );
    assert.equal(new URL(url).searchParams.get("connection_limit"), "2");
  });
});
