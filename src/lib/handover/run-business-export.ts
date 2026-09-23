import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { buildBusinessExportPackage, type BusinessExportPackage } from "./business-package";
import { exportClientModels } from "./prisma-export";
import { exportStorageFiles } from "./storage";
import { createSupabaseDownloader } from "./supabase-download";

export async function runBusinessExport(opts?: {
  generatedAt?: Date;
}): Promise<BusinessExportPackage> {
  const models = await exportClientModels(prisma as never);
  const storage = await exportStorageFiles(models, {
    download: createSupabaseDownloader() ?? undefined,
  });

  let dictionaryMd = "";
  try {
    dictionaryMd = await readFile(
      path.join(process.cwd(), "docs/client-handover/DATA_DICTIONARY.md"),
      "utf8",
    );
  } catch {
    dictionaryMd = "# מילון נתונים\n\nהקובץ לא היה זמין בשרת בעת הייצוא. ראו database/*.json.\n";
  }

  return buildBusinessExportPackage({
    models,
    storageFiles: storage.files,
    storageManifest: storage.manifest,
    dictionaryMd,
    generatedAt: opts?.generatedAt,
  });
}
