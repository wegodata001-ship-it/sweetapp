/**
 * Client handover exporter tests.
 * Run: npx tsx --test src/lib/handover/handover-export.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import {
  APPROVED_MAP_CLIENT_COUNT,
  CLIENT_MODELS,
  EXCLUDED_MODELS,
  USER_EXCLUDED_FIELDS,
  clientModelNames,
  prismaModelsFromSchema,
} from "./catalog";
import { csvEscape, rowsToCsv, storageManifestCsv } from "./csv";
import { buildCustomerDerivedLedger } from "./derived-ledgers";
import {
  buildHandoverPackage,
  PACKAGE_ROOT,
  sha256FileContents,
  sha256FileName,
} from "./package";
import { paginateFindMany, type PrismaDelegate } from "./prisma-export";
import {
  amountToDecimalString,
  serializeRow,
  serializeRows,
  toIso8601,
  redactSecrets,
} from "./serialize";
import {
  exportStorageFiles,
  sha256Hex,
  storageCredentialsPresent,
  storageSummary,
} from "./storage";
import { buildValidationReport, findBrokenForeignKeys } from "./validate";
import type { ExportedModel } from "./prisma-export";

function emptyModels(): ExportedModel[] {
  return CLIENT_MODELS.map((def) => ({ def, sourceCount: 0, rows: [] }));
}

function schemaText(): string {
  return readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
}

describe("catalog coverage", () => {
  it("covers every Prisma model except PasswordResetToken", () => {
    const prismaModels = prismaModelsFromSchema(schemaText());
    assert.equal(prismaModels.length, 72);
    const expected = prismaModels.filter((m) => !EXCLUDED_MODELS.includes(m as "PasswordResetToken"));
    const covered = new Set(clientModelNames());
    assert.equal(covered.size, expected.length);
    for (const name of expected) {
      assert.ok(covered.has(name), `missing client model ${name}`);
    }
    assert.equal(covered.has("PasswordResetToken"), false);
    assert.equal(CLIENT_MODELS.length, 71);
    assert.equal(APPROVED_MAP_CLIENT_COUNT, 69);
  });

  it("places every model in a client folder including OTHER", () => {
    const folders = new Set(CLIENT_MODELS.map((m) => m.folder));
    assert.ok(folders.has("OTHER"));
    assert.ok(CLIENT_MODELS.some((m) => m.model === "OcrCache" && m.folder === "OTHER"));
    assert.ok(CLIENT_MODELS.some((m) => m.folder === "FINANCE"));
    assert.ok(CLIENT_MODELS.some((m) => m.folder === "INVENTORY"));
  });
});

describe("auth exclusions", () => {
  it("never exports passwordHash or currentSessionId", () => {
    const row = serializeRow(
      {
        id: "u1",
        fullName: "Ada",
        email: "ada@example.com",
        role: "ADMIN",
        isActive: true,
        passwordHash: "SECRET_HASH",
        currentSessionId: "sess-1",
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
        updatedAt: new Date("2026-01-02T03:04:05.000Z"),
      },
      { excludeFields: [...USER_EXCLUDED_FIELDS] },
    );
    assert.equal(row.id, "u1");
    assert.equal(row.fullName, "Ada");
    assert.equal(row.email, "ada@example.com");
    assert.equal("passwordHash" in row, false);
    assert.equal("currentSessionId" in row, false);
    const json = JSON.stringify(row);
    assert.equal(json.includes("SECRET_HASH"), false);
    assert.equal(json.includes("sess-1"), false);
    assert.equal(json.toLowerCase().includes("passwordhash"), false);
  });

  it("excludes PasswordResetToken from the catalog", () => {
    assert.deepEqual([...EXCLUDED_MODELS], ["PasswordResetToken"]);
    assert.equal(clientModelNames().includes("PasswordResetToken"), false);
  });
});

describe("serialize", () => {
  it("preserves decimal precision as a string", () => {
    assert.equal(amountToDecimalString(1234.56), "1234.56");
    assert.equal(amountToDecimalString("1234.56"), "1234.56");
    const row = serializeRow(
      { id: "p1", amount: 1234.56, currency: "ILS" },
      { amountFields: ["amount"] },
    );
    assert.equal(row.amount, "1234.56");
    assert.equal(typeof row.amount, "string");
    assert.equal(row.currency, "ILS");
  });

  it("preserves timestamps as ISO-8601 and IDs/nulls", () => {
    const at = new Date("2026-03-04T05:06:07.890Z");
    const row = serializeRow({
      id: "keep-me",
      createdAt: at,
      notes: null,
      status: "ACTIVE",
    });
    assert.equal(row.id, "keep-me");
    assert.equal(row.createdAt, "2026-03-04T05:06:07.890Z");
    assert.equal(row.notes, null);
    assert.equal(row.status, "ACTIVE");
    assert.equal(toIso8601(at), "2026-03-04T05:06:07.890Z");
  });

  it("JSON serialization keeps nulls and relations", () => {
    const rows = serializeRows([
      { id: "a", parentId: "b", amount: 10, missing: null },
    ], { amountFields: ["amount"] });
    const json = JSON.parse(JSON.stringify(rows));
    assert.equal(json[0].id, "a");
    assert.equal(json[0].parentId, "b");
    assert.equal(json[0].amount, "10");
    assert.equal(json[0].missing, null);
  });
});

describe("csv", () => {
  it("escapes quotes, commas, and newlines", () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
    assert.equal(csvEscape("a,b"), '"a,b"');
    assert.equal(csvEscape("line1\nline2"), '"line1\nline2"');
    assert.equal(csvEscape(null), "");
    const csv = rowsToCsv([{ id: "1", name: 'A, "B"' }]);
    assert.match(csv, /"A, ""B"""/);
  });

  it("empty table writes an empty CSV or header-only", () => {
    assert.equal(rowsToCsv([]), "");
    assert.equal(rowsToCsv([], ["id", "name"]), "id,name\n");
  });
});

describe("pagination", () => {
  it("walks large tables by cursor pages", async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}` }));
    let calls = 0;
    const delegate: PrismaDelegate = {
      count: async () => all.length,
      findMany: async ({ take, skip, cursor }) => {
        calls += 1;
        let start = 0;
        if (cursor && typeof cursor === "object" && "id" in cursor) {
          const idx = all.findIndex((r) => r.id === cursor.id);
          start = idx + (skip ?? 0);
        }
        return all.slice(start, start + take);
      },
    };
    const rows = await paginateFindMany(delegate, "id", 2);
    assert.equal(rows.length, 5);
    assert.ok(calls >= 3);
    assert.deepEqual(rows.map((r) => r.id), all.map((r) => r.id));
  });
});

describe("validation", () => {
  it("count reconciliation PASS/FAIL", () => {
    const models: ExportedModel[] = [
      { def: CLIENT_MODELS.find((m) => m.model === "Customer")!, sourceCount: 2, rows: [{ id: "c1" }, { id: "c2" }] },
      { def: CLIENT_MODELS.find((m) => m.model === "Payment")!, sourceCount: 1, rows: [] },
    ];
    const report = buildValidationReport({ models, approvedMapCount: 69 });
    assert.equal(report.counts.find((c) => c.model === "Customer")?.status, "PASS");
    assert.equal(report.counts.find((c) => c.model === "Payment")?.status, "FAIL");
    assert.equal(report.countsPass, false);
  });

  it("reports broken foreign references without rewriting them", () => {
    const { broken, valid } = findBrokenForeignKeys({
      Customer: [{ id: "c1" }],
      Payment: [
        { id: "p1", customerId: "c1", documentId: null },
        { id: "p2", customerId: "missing-customer", documentId: null },
      ],
      FinancialDocument: [],
    });
    assert.equal(valid, 1);
    assert.equal(broken.length, 1);
    assert.equal(broken[0].value, "missing-customer");
    assert.equal(broken[0].field, "customerId");
  });
});

describe("storage", () => {
  it("builds a manifest, checksums files, and reports missing objects", async () => {
    const def = CLIENT_MODELS.find((m) => m.model === "DocumentUpload")!;
    const models: ExportedModel[] = [
      {
        def,
        sourceCount: 2,
        rows: [
          {
            id: "d1",
            storageBucket: "docs",
            storagePath: "income/a.pdf",
            fileName: "a.pdf",
          },
          {
            id: "d2",
            storageBucket: "docs",
            storagePath: "income/missing.pdf",
            fileName: "missing.pdf",
          },
        ],
      },
    ];
    const bytes = new TextEncoder().encode("hello-file");
    const result = await exportStorageFiles(models, {
      env: {
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-not-logged",
      },
      download: async (_bucket, path) => {
        if (path.includes("missing")) return { ok: false, reason: "MISSING_SOURCE_FILE" };
        return { ok: true, bytes };
      },
    });
    assert.equal(result.manifest.length, 2);
    const exported = result.manifest.find((r) => r.dbRecordId === "d1")!;
    const missing = result.manifest.find((r) => r.dbRecordId === "d2")!;
    assert.equal(exported.status, "EXPORTED");
    assert.equal(exported.checksum, sha256Hex(bytes));
    assert.equal(missing.status, "MISSING_SOURCE_FILE");
    assert.equal(missing.exportedPath, "");
    const csv = storageManifestCsv(result.manifest);
    assert.match(csv, /MISSING_SOURCE_FILE/);
    assert.match(csv, /EXPORTED/);
    const summary = storageSummary(result.manifest);
    assert.equal(summary.exported, 1);
    assert.equal(summary.missing, 1);
  });

  it("fail-closes storage when credentials are missing", async () => {
    assert.equal(storageCredentialsPresent({} as NodeJS.ProcessEnv), false);
    const def = CLIENT_MODELS.find((m) => m.model === "DocumentUpload")!;
    const result = await exportStorageFiles(
      [
        {
          def,
          sourceCount: 1,
          rows: [{ id: "d1", storageBucket: "docs", storagePath: "x.pdf" }],
        },
      ],
      { env: {} as NodeJS.ProcessEnv },
    );
    assert.equal(result.manifest[0]?.status, "NOT_ACCESSIBLE");
    assert.equal(result.files.size, 0);
  });
});

describe("derived ledgers", () => {
  it("marks computed ledgers as derived and keeps source IDs", () => {
    const { lines, note } = buildCustomerDerivedLedger({
      customerId: "c1",
      openingBalance: "100.00",
      documents: [{ id: "doc1", customerId: "c1", totalAmount: "50", title: "Invoice", documentType: "חשבונית מס", createdAt: "2026-01-01T00:00:00.000Z" }],
      payments: [{ id: "pay1", customerId: "c1", amount: "20", createdAt: "2026-01-02T00:00:00.000Z" }],
    });
    assert.match(note, /DERIVED DATA/);
    assert.ok(lines.some((l) => l.sourceId === "doc1" && l.sourceModel === "FinancialDocument"));
    assert.ok(lines.some((l) => l.sourceId === "pay1" && l.sourceModel === "Payment"));
  });
});

describe("zip + checksum", () => {
  it("builds the package zip and SHA-256 sidecar text", async () => {
    const models = emptyModels();
    const customer = models.find((m) => m.def.model === "Customer")!;
    customer.sourceCount = 1;
    customer.rows = [
      {
        id: "cust-1",
        name: "Acme",
        openingBalance: "0",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const pkg = await buildHandoverPackage({
      models,
      storageFiles: new Map(),
      storageManifest: [],
      dictionaryMd: "# dict\n",
      generatedAt: new Date("2026-09-22T10:00:00.000Z"),
      realExport: false,
    });

    assert.equal(pkg.zipFileName, "WEGO_CLIENT_FULL_DATA_2026-09-22.zip");
    assert.equal(sha256FileName(pkg.zipFileName), "WEGO_CLIENT_FULL_DATA_2026-09-22.zip.sha256");
    assert.equal(pkg.sha256, createHash("sha256").update(pkg.zip).digest("hex"));
    assert.match(sha256FileContents(pkg.sha256, pkg.zipFileName), new RegExp(`^${pkg.sha256}  ${pkg.zipFileName}\\n$`));

    const zip = await JSZip.loadAsync(pkg.zip);
    const names = Object.keys(zip.files);
    assert.ok(names.includes(`${PACKAGE_ROOT}/README.md`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/manifest.json`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/DATA_DICTIONARY.md`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/EXPORT_SUMMARY.md`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/VALIDATION_REPORT.md`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/TECHNICAL_BACKUP/Customer.json`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/CLIENT_FILES/CUSTOMERS/customers.csv`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/CLIENT_FILES/CUSTOMERS/cust-1/customer.json`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/STORAGE/storage-manifest.csv`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/CLIENT_FILES/FINANCE/COMPUTED_LEDGERS/README.md`));
    assert.ok(names.includes(`${PACKAGE_ROOT}/CLIENT_FILES/OTHER/ocr-cache.csv`));

    for (const def of CLIENT_MODELS) {
      assert.ok(names.includes(`${PACKAGE_ROOT}/TECHNICAL_BACKUP/${def.model}.json`), def.model);
    }

    const customerJson = JSON.parse(await zip.file(`${PACKAGE_ROOT}/TECHNICAL_BACKUP/Customer.json`)!.async("string"));
    assert.equal(customerJson[0].id, "cust-1");
    assert.equal(pkg.validation.coveredClientModels, 71);
    assert.equal(pkg.validation.passwordResetTokensExcluded, true);
    assert.equal(pkg.validation.passwordsExcluded, true);
  });
});

describe("secrets", () => {
  it("redacts connection strings and never requires printing env values", () => {
    const text = redactSecrets("fail postgres://user:pass@host/db and eyJabcdefghijk.payload.signature");
    assert.equal(text.includes("user:pass"), false);
    assert.equal(text.includes("postgres://"), false);
  });
});
