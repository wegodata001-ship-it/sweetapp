/**
 * איפוס מלא לפני מסירה ללקוח.
 * שימוש: npx tsx scripts/reset-client-system.ts
 * גיבוי: npx tsx scripts/reset-client-system.ts --backup-only
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  exportClientDataBackup,
  resetClientSystemData,
} from "../src/lib/system/reset-client-data";
import { countOpenInvoices } from "../src/lib/finance/open-invoices";

const backupOnly = process.argv.includes("--backup-only");

async function main() {
  const backup = await exportClientDataBackup();
  const dir = path.join(process.cwd(), "tmp", "client-reset-backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `backup-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");
  console.log("[BACKUP] wrote", file);
  console.log("[BACKUP] counts", backup.counts);

  if (backupOnly) return;

  const before = await countOpenInvoices({ log: true });
  console.log("[RESET] open invoices before:", before);

  const stats = await resetClientSystemData();
  console.log("[RESET] deleted:", stats);

  const after = await countOpenInvoices({ log: true });
  console.log("[RESET] open invoices after:", after);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
