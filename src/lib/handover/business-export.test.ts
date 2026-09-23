/**
 * Run: npx tsx --test src/lib/handover/business-export.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { CLIENT_MODELS } from "./catalog";
import {
  BUSINESS_PACKAGE_PREFIX,
  buildBusinessExportPackage,
  businessExportCoveredFolders,
} from "./business-package";
import { serializeRow } from "./serialize";
import type { ExportedModel } from "./prisma-export";

function modelsWithSample(): ExportedModel[] {
  return CLIENT_MODELS.map((def) => {
    if (def.model === "Customer") {
      return {
        def,
        sourceCount: 1,
        rows: [
          {
            id: "c1",
            name: "לקוח בדיקה",
            phone: "0500000000",
            openingBalance: "100.50",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      };
    }
    if (def.model === "User") {
      return {
        def,
        sourceCount: 1,
        rows: [
          serializeRow(
            {
              id: "u1",
              fullName: "מנהל",
              email: "admin@example.com",
              role: "ADMIN",
              isActive: true,
              passwordHash: "SECRET",
              currentSessionId: "sess",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
            { excludeFields: def.excludeFields },
          ),
        ],
      };
    }
    if (def.model === "Payment") {
      return {
        def,
        sourceCount: 1,
        rows: [
          {
            id: "p1",
            customerId: "c1",
            amount: "50.00",
            createdAt: "2026-01-02T00:00:00.000Z",
            documentId: null,
          },
        ],
      };
    }
    return { def, sourceCount: 0, rows: [] };
  });
}

describe("business export package", () => {
  it("builds a Hebrew client-friendly zip plus technical backup", async () => {
    const pkg = await buildBusinessExportPackage({
      models: modelsWithSample(),
      storageFiles: new Map(),
      storageManifest: [],
      dictionaryMd: "# dict\n",
      generatedAt: new Date("2026-09-22T10:00:00.000Z"),
    });
    assert.equal(pkg.zipFileName, `${BUSINESS_PACKAGE_PREFIX}_2026-09-22.zip`);
    assert.equal(pkg.validation.countsPass, true);
    assert.equal(pkg.validation.passwordsExcluded, true);

    const zip = await JSZip.loadAsync(pkg.zip);
    const names = Object.keys(zip.files);
    for (const folder of businessExportCoveredFolders()) {
      assert.ok(names.some((n) => n.includes(`/${folder}/`)), folder);
    }
    assert.ok(names.some((n) => n.endsWith("00_קרא_אותי/הסבר_על_הנתונים.pdf")));
    assert.ok(names.some((n) => n.endsWith("00_קרא_אותי/סיכום_הייצוא.xlsx")));
    assert.ok(names.some((n) => n.endsWith("01_לקוחות/לקוחות.xlsx")));
    assert.ok(names.some((n) => n.endsWith("04_כספים/תשלומים.xlsx")));
    assert.ok(names.some((n) => n.endsWith("99_גיבוי_טכני/manifest.json")));
    assert.ok(names.some((n) => n.endsWith("99_גיבוי_טכני/database/Customer.json")));
    assert.ok(names.some((n) => n.endsWith("99_גיבוי_טכני/database/User.json")));

    const userJson = JSON.parse(
      await zip.file(
        Object.keys(zip.files).find((n) => n.endsWith("database/User.json"))!,
      )!.async("string"),
    );
    assert.equal("passwordHash" in userJson[0], false);
    assert.equal("currentSessionId" in userJson[0], false);
    assert.equal(userJson[0].fullName, "מנהל");
  });
});
