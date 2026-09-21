/**
 * Run: npx tsx --test src/app/api/admin/ledger-forensic-audit/route.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const routePath = path.join(process.cwd(), "src/app/api/admin/ledger-forensic-audit/route.ts");
const libPath = path.join(process.cwd(), "src/lib/finance/ledger-forensic-audit.ts");

describe("ledger-forensic-audit route safety", () => {
  it("is GET-only Super Admin and never writes", () => {
    const route = fs.readFileSync(routePath, "utf8");
    const lib = fs.readFileSync(libPath, "utf8");
    const combined = `${route}\n${lib}`;

    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST/);
    assert.doesNotMatch(route, /export async function PUT/);
    assert.doesNotMatch(route, /export async function PATCH/);
    assert.doesNotMatch(route, /export async function DELETE/);
    assert.match(route, /authorizeLedgerForensicAudit/);
    assert.match(route, /LEDGER_AUDIT_FAILED/);
    assert.doesNotMatch(route, /DATABASE_URL|DIRECT_URL/);

    assert.doesNotMatch(combined, /\.createMany\s*\(/);
    assert.doesNotMatch(combined, /\.updateMany\s*\(/);
    assert.doesNotMatch(combined, /\.deleteMany\s*\(/);
    assert.doesNotMatch(combined, /\.upsert\s*\(/);
    assert.doesNotMatch(combined, /\$executeRaw/);
    assert.doesNotMatch(combined, /\$executeRawUnsafe/);
    assert.doesNotMatch(combined, /prisma\.\w+\.create\s*\(/);
    assert.doesNotMatch(combined, /prisma\.\w+\.update\s*\(/);
    assert.doesNotMatch(combined, /prisma\.\w+\.delete\s*\(/);

    assert.match(route, /findMany/);
    assert.equal((route.match(/Promise\.all/g) || []).length, 1);
  });
});
