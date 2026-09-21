/**
 * CLI → existing ledger-forensic-audit.ts → Prisma findMany only → report.
 * Env: ONLY .env.production.audit. Never prints DATABASE_URL.
 *
 * Usage: npx tsx scripts/run-ledger-forensic-audit.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  runLedgerForensicAudit,
  sanitizeLedgerAuditError,
  type ForensicEntityRow,
  type ForensicIssueCode,
} from "../src/lib/finance/ledger-forensic-audit";

const AUDIT_ENV_FILE = ".env.production.audit";
const EPS = 0.005;

const CODE_ONLY = new Set<ForensicIssueCode>([
  "CREDIT_CLAMP",
  "OPENING_BALANCE_IGNORED",
  "CREDIT_NOTE_DIRECTION",
  "DATE_RANGE_BALANCE",
]);
const SOURCE = new Set<ForensicIssueCode>([
  "AMOUNT_MISMATCH",
  "ORPHAN_ENTRY",
  "SOURCE_WITHOUT_LEDGER",
]);
const EXPECTED = new Set<ForensicIssueCode>([
  "CREDIT_CLAMP",
  "OPENING_BALANCE_IGNORED",
  "CREDIT_NOTE_DIRECTION",
]);

function parseEnvFile(filePath: string): Record<string, string> {
  const text = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

function loadAuditEnv(): { ok: true } | { ok: false; reason: string } {
  const envPath = path.join(process.cwd(), AUDIT_ENV_FILE);
  if (!fs.existsSync(envPath)) return { ok: false, reason: "MISSING_AUDIT_ENV_FILE" };
  const parsed = parseEnvFile(envPath);
  const url = String(parsed.DATABASE_URL || "").trim();
  if (!url) return { ok: false, reason: "NO_DATABASE_URL" };
  if (url.length < 20 || /SENSITIVE|placeholder/i.test(url)) {
    return { ok: false, reason: "PLACEHOLDER_DATABASE_URL" };
  }
  if (!/^postgres/i.test(url)) return { ok: false, reason: "UNEXPECTED_DB_PROVIDER" };
  try {
    const u = new URL(url.replace(/^postgresql:/i, "postgres:"));
    const host = (u.hostname || "").toLowerCase();
    if (!host) return { ok: false, reason: "NO_DB_HOST" };
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
      return { ok: false, reason: "LOCAL_DB_REJECTED" };
    }
  } catch {
    return { ok: false, reason: "UNPARSEABLE_DATABASE_URL" };
  }
  delete process.env.DIRECT_URL;
  process.env.DATABASE_URL = url;
  const direct = String(parsed.DIRECT_URL || "").trim();
  if (direct.length >= 20 && /^postgres/i.test(direct) && !/SENSITIVE|placeholder/i.test(direct)) {
    process.env.DIRECT_URL = direct;
  }
  return { ok: true };
}

function classifyRow(
  row: ForensicEntityRow,
  duplicateIds: Set<string>,
): "CODE_ONLY" | "SOURCE_DATA" | "EXPECTED_BEHAVIOR_CHANGE" | "DUPLICATE_RELATED" | "NEEDS_MANUAL_REVIEW" {
  const codes = row.issues.map((i) => i.code);
  const hasSource = codes.some((c) => SOURCE.has(c));
  const hasCode = codes.some((c) => CODE_ONLY.has(c));
  const onlyExpected = codes.length > 0 && codes.every((c) => EXPECTED.has(c));
  const onlyCode = codes.length > 0 && codes.every((c) => CODE_ONLY.has(c));
  if (hasSource && hasCode) return "NEEDS_MANUAL_REVIEW";
  if (hasSource) return "SOURCE_DATA";
  if (onlyExpected) return "EXPECTED_BEHAVIOR_CHANGE";
  if (onlyCode) return "CODE_ONLY";
  if (duplicateIds.has(row.id) && !hasSource && !hasCode) return "DUPLICATE_RELATED";
  if (Math.abs(row.difference) > EPS && codes.length === 0) return "NEEDS_MANUAL_REVIEW";
  if (duplicateIds.has(row.id)) return "DUPLICATE_RELATED";
  return "NEEDS_MANUAL_REVIEW";
}

function money(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function main() {
  const loaded = loadAuditEnv();
  const present = loaded.ok;
  console.log("DATABASE_URL:", present ? "PRESENT" : "ABSENT");
  if (!loaded.ok) {
    console.log("STOP:", loaded.reason);
    process.exit(2);
  }

  const prisma = new PrismaClient({ log: ["error"] });
  const outPath = path.join(os.tmpdir(), "ledger-forensic-audit-production.json");

  try {
    const [customers, suppliers, employees, documents, payments, ledgerEntries] = await Promise.all([
      prisma.customer.findMany({
        select: { id: true, name: true, phone: true, openingBalance: true },
        orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        select: { id: true, name: true, phone: true, email: true, openingBalance: true },
        orderBy: { name: "asc" },
      }),
      prisma.employee.findMany({
        select: { id: true, name: true, phone: true, openingBalance: true },
        orderBy: { name: "asc" },
      }),
      prisma.financialDocument.findMany({
        select: {
          id: true,
          title: true,
          category: true,
          documentType: true,
          customerId: true,
          supplierId: true,
          employeeId: true,
          totalAmount: true,
          docDate: true,
          createdAt: true,
        },
      }),
      prisma.payment.findMany({
        select: {
          id: true,
          customerId: true,
          documentId: true,
          amount: true,
          createdAt: true,
          document: { select: { title: true } },
        },
      }),
      prisma.ledgerEntry.findMany({
        select: {
          id: true,
          debit: true,
          credit: true,
          entryDate: true,
          createdAt: true,
          docType: true,
          description: true,
          financialDocumentId: true,
          supplierId: true,
          employeeId: true,
        },
      }),
    ]);

    const report = runLedgerForensicAudit({
      customers,
      suppliers,
      employees,
      documents,
      payments: payments.map((p) => ({
        id: p.id,
        customerId: p.customerId,
        amount: p.amount,
        createdAt: p.createdAt,
        documentId: p.documentId,
        documentTitle: p.document?.title ?? null,
      })),
      ledgerEntries,
    });

    const duplicateIds = new Set<string>();
    for (const group of [
      ...report.duplicates.possible,
      ...report.duplicates.confirmed,
      ...report.duplicates.legitimateMultiRole,
    ]) {
      for (const e of group.entities) duplicateIds.add(e.id);
    }

    const withType = (
      entityType: "customer" | "supplier" | "employee",
      rows: ForensicEntityRow[],
    ) =>
      rows.map((row) => ({
        entityType,
        ...row,
        classification: classifyRow(row, duplicateIds),
      }));

    const all = [
      ...withType("customer", report.customers.rows),
      ...withType("supplier", report.suppliers.rows),
      ...withType("employee", report.employees.rows),
    ];
    const oldNeNew = all.filter((r) => Math.abs(r.oldBalance - r.newBalance) > EPS);
    const needsManual = all.filter((r) => r.classification === "NEEDS_MANUAL_REVIEW").length;

    const payload = {
      ok: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      engine: "ledger-forensic-audit.ts + ledger-balance.ts",
      writes: 0,
      summary: {
        customers: { total: report.customers.total, pass: report.customers.pass, fail: report.customers.fail },
        suppliers: { total: report.suppliers.total, pass: report.suppliers.pass, fail: report.suppliers.fail },
        employees: { total: report.employees.total, pass: report.employees.pass, fail: report.employees.fail },
        affectedByOldClamp: report.affectedByOldClamp,
        affectedByOpeningBalance: report.affectedByOpeningBalance,
        affectedByCreditNote: report.affectedByCreditNote,
        affectedByDateRange: report.affectedByDateRange,
        duplicates: {
          possible: report.duplicates.possible.length,
          confirmed: report.duplicates.confirmed.length,
          legitimateMultiRole: report.duplicates.legitimateMultiRole.length,
        },
        sourceDataErrors: report.sourceDataErrors,
        codeOnlyErrors: report.codeOnlyErrors,
        needsManualReview: needsManual,
        oldNotEqualNew: oldNeNew.length,
      },
      coverage: report.coverage,
      oldNotEqualNew: oldNeNew.map((r) => ({
        entityType: r.entityType,
        id: r.id,
        name: r.name,
        old: money(r.oldBalance),
        new: money(r.newBalance),
        difference: money(r.difference),
        openingBalance: money(r.openingBalance),
        newDebt: money(r.newDebt),
        newCredit: money(r.newCredit),
        issues: r.issues.map((i) => i.code),
        classification: r.classification,
        status: r.status,
      })),
      duplicates: report.duplicates,
      knownCases: report.knownCases,
      carmelGap: report.carmelGap
        ? {
            id: report.carmelGap.id,
            name: report.carmelGap.name,
            historicalGap: report.carmelGap.historicalGap,
            gapStillPresent: report.carmelGap.gapStillPresent,
            explanation: report.carmelGap.explanation,
            payments1530: report.carmelGap.payments1530.length,
            payments1529_38: report.carmelGap.payments1529_38.length,
            documents1530: report.carmelGap.documents1530.length,
            documents1529_38: report.carmelGap.documents1529_38.length,
            entity: report.carmelGap.entity,
          }
        : null,
      orphans: report.orphans,
    };

    fs.writeFileSync(outPath, JSON.stringify(payload), "utf8");
    console.log("AUDIT_SAVED:", "YES");
    console.log("SUMMARY_JSON", JSON.stringify(payload.summary));
    console.log("COVERAGE_JSON", JSON.stringify(payload.coverage));
    console.log("OLD_NE_NEW_JSON", JSON.stringify(payload.oldNotEqualNew));
    console.log("DUPLICATES_JSON", JSON.stringify(payload.duplicates));
    console.log(
      "KNOWN_CASES_JSON",
      JSON.stringify(
        Object.fromEntries(
          Object.entries(payload.knownCases).map(([k, rows]) => [
            k,
            (rows as ForensicEntityRow[]).map((r) => ({
              id: r.id,
              name: r.name,
              old: money(r.oldBalance),
              new: money(r.newBalance),
              difference: money(r.difference),
              openingBalance: money(r.openingBalance),
              issues: r.issues.map((i) => i.code),
              status: r.status,
              classification: classifyRow(r, duplicateIds),
            })),
          ]),
        ),
      ),
    );
    console.log("CARMEL_GAP_JSON", JSON.stringify(payload.carmelGap));
    console.log("ORPHANS_JSON", JSON.stringify(payload.orphans));
  } catch (error) {
    console.error("AUDIT_FAILED", sanitizeLedgerAuditError(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("AUDIT_FAILED", sanitizeLedgerAuditError(error));
  process.exit(1);
});
