/**
 * Read-only client handover export.
 * Fail-closed: no DATABASE_URL → exit 2. Does not print secrets.
 * Does not DELETE / UPDATE / INSERT / UPSERT / TRUNCATE / DROP / ALTER.
 *
 * Usage: npx tsx scripts/run-client-handover-export.ts --out ./exports
 */
import { loadAuditEnv } from "../src/lib/handover/load-audit-env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, prismaReady } from "../src/lib/prisma";
import { CLIENT_MODELS } from "../src/lib/handover/catalog";
import { exportClientModels } from "../src/lib/handover/prisma-export";
import {
  buildHandoverPackage,
  sha256FileContents,
  sha256FileName,
} from "../src/lib/handover/package";
import { exportStorageFiles, storageCredentialsPresent } from "../src/lib/handover/storage";
import { createSupabaseDownloader } from "../src/lib/handover/supabase-download";
import { redactSecrets } from "../src/lib/handover/serialize";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const outDir = path.resolve(argValue("--out") ?? "./exports");
  const env = loadAuditEnv();
  console.log(`DATABASE_URL: ${env.databaseUrl}`);

  if (env.databaseUrl !== "PRESENT" || !(await prismaReady())) {
    console.log("EXPORT_BLOCKED: NO_DATABASE_URL");
    console.log("READY TO RUN FULL CLIENT EXPORT: NO");
    process.exit(2);
  }

  const models = await exportClientModels(prisma as never);
  const downloader = createSupabaseDownloader();
  const storage = await exportStorageFiles(models, {
    download: downloader ?? undefined,
  });

  let dictionaryMd = "";
  try {
    dictionaryMd = await readFile(
      path.resolve("docs/client-handover/DATA_DICTIONARY.md"),
      "utf8",
    );
  } catch {
    dictionaryMd = "# DATA_DICTIONARY.md missing from repo at export time\n";
  }

  const pkg = await buildHandoverPackage({
    models,
    storageFiles: storage.files,
    storageManifest: storage.manifest,
    dictionaryMd,
    realExport: true,
  });

  await mkdir(outDir, { recursive: true });
  const zipPath = path.join(outDir, pkg.zipFileName);
  const hashPath = path.join(outDir, sha256FileName(pkg.zipFileName));
  await writeFile(zipPath, pkg.zip);
  await writeFile(hashPath, sha256FileContents(pkg.sha256, pkg.zipFileName), "utf8");

  console.log("EXPORT_WRITTEN: YES");
  console.log(`CLIENT_MODELS: ${models.length}/${CLIENT_MODELS.length}`);
  for (const row of pkg.validation.counts) {
    console.log(`COUNT ${row.model}: source ${row.sourceCount} exported ${row.exportedCount} ${row.status}`);
  }
  console.log(`ZIP: ${pkg.zipFileName}`);
  console.log(`ZIP_PATH: ${zipPath}`);
  console.log(`SHA256: ${pkg.sha256}`);
  console.log(`SHA256_PATH: ${hashPath}`);
  console.log(`STORAGE_CREDENTIALS: ${storageCredentialsPresent() ? "YES" : "NO"}`);
  console.log(`STORAGE_REFERENCED: ${storage.manifest.length}`);
  console.log(`STORAGE_EXPORTED: ${storage.manifest.filter((r) => r.status === "EXPORTED").length}`);
  console.log(`STORAGE_MISSING: ${storage.manifest.filter((r) => r.status === "MISSING_SOURCE_FILE").length}`);
  console.log(`STORAGE_NOT_ACCESSIBLE: ${storage.manifest.filter((r) => r.status === "NOT_ACCESSIBLE").length}`);
  console.log(`STORAGE_INVALID: ${storage.manifest.filter((r) => r.status === "INVALID_REFERENCE").length}`);
  console.log(`COUNT_VALIDATION: ${pkg.validation.countsPass ? "PASS" : "FAIL"}`);
  console.log(`RELATIONS_VALID: ${pkg.validation.relationsValid}`);
  console.log(`BROKEN_FOREIGN_REFERENCES: ${pkg.validation.relationsBroken}`);
  console.log("PRODUCTION_DATA_MODIFIED: NO");
  console.log("DB_WRITES: 0");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.log("EXPORT_FAILED");
  console.log(redactSecrets(String(e instanceof Error ? e.message : e)));
  process.exit(1);
});
