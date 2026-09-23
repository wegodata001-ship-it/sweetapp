import { createHash } from "node:crypto";
import JSZip from "jszip";
import {
  APPROVED_MAP_CLIENT_COUNT,
  CLIENT_MODELS,
  EXCLUDED_MODELS,
  EXPORT_CURRENCY,
  USER_EXCLUDED_FIELDS,
} from "./catalog";
import { rowsToCsv, storageManifestCsv } from "./csv";
import { buildCustomerDerivedLedger } from "./derived-ledgers";
import { exportSummaryMd, handoverReadme, validationReportMd } from "./docs";
import type { ExportedModel } from "./prisma-export";
import { stableJson } from "./serialize";
import type { StorageManifestRow } from "./storage";
import { storageSummary } from "./storage";
import { buildValidationReport, type ValidationReport } from "./validate";

export const EXPORT_VERSION = "1.0.0";
export const PACKAGE_ROOT = "WEGO_CLIENT_FULL_DATA";

export type PackageFile = string | Uint8Array;

export type HandoverPackage = {
  files: Map<string, PackageFile>;
  zip: Uint8Array;
  sha256: string;
  zipFileName: string;
  validation: ValidationReport;
  manifest: Record<string, unknown>;
};

function kebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function byModel(models: ExportedModel[]): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const m of models) out[m.def.model] = m.rows;
  return out;
}

function findModel(models: ExportedModel[], name: string): ExportedModel | undefined {
  return models.find((m) => m.def.model === name);
}

export function dateStamp(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildManifest(input: {
  generatedAt: string;
  appVersion: string;
  models: ExportedModel[];
  storageManifest: StorageManifestRow[];
  fileNames: string[];
}): Record<string, unknown> {
  return {
    exportVersion: EXPORT_VERSION,
    generatedAt: input.generatedAt,
    applicationVersion: input.appVersion,
    schemaVersion: input.appVersion,
    currency: EXPORT_CURRENCY,
    multiTenant: false,
    models: input.models.map((m) => ({
      name: m.def.model,
      folder: m.def.folder,
      recordCount: m.rows.length,
      sourceCount: m.sourceCount,
      technicalJson: `TECHNICAL_BACKUP/${m.def.model}.json`,
      technicalCsv: `TECHNICAL_BACKUP/${m.def.model}.csv`,
      idField: m.def.idField,
    })),
    recordCount: Object.fromEntries(input.models.map((m) => [m.def.model, m.rows.length])),
    fileNames: input.fileNames,
    excludedFields: [...USER_EXCLUDED_FIELDS],
    excludedModels: [...EXCLUDED_MODELS],
    storageManifest: "STORAGE/storage-manifest.csv",
    approvedMapClientCount: APPROVED_MAP_CLIENT_COUNT,
    coveredClientModels: input.models.length,
  };
}

export async function buildHandoverPackage(input: {
  models: ExportedModel[];
  storageFiles: Map<string, Uint8Array>;
  storageManifest: StorageManifestRow[];
  dictionaryMd: string;
  generatedAt?: Date;
  appVersion?: string;
  realExport?: boolean;
}): Promise<HandoverPackage> {
  const generatedAt = input.generatedAt ?? new Date();
  const generatedAtIso = generatedAt.toISOString();
  const appVersion = input.appVersion ?? "0.1.0";
  const files = new Map<string, PackageFile>();
  const put = (rel: string, body: PackageFile) => {
    files.set(`${PACKAGE_ROOT}/${rel.replace(/^\/+/, "")}`, body);
  };

  const validation = buildValidationReport({
    models: input.models,
    approvedMapCount: APPROVED_MAP_CLIENT_COUNT,
  });
  const storageStats = storageSummary(input.storageManifest);
  const rows = byModel(input.models);

  put("README.md", handoverReadme());
  put("DATA_DICTIONARY.md", input.dictionaryMd);
  put(
    "EXPORT_SUMMARY.md",
    exportSummaryMd({
      generatedAt: generatedAtIso,
      exportVersion: EXPORT_VERSION,
      appVersion,
      modelCount: input.models.length,
      storage: storageStats,
      validation,
      realExport: Boolean(input.realExport),
    }),
  );
  put(
    "VALIDATION_REPORT.md",
    validationReportMd({
      validation,
      storage: storageStats,
      manifest: input.storageManifest,
    }),
  );

  for (const exported of input.models) {
    const jsonName = `TECHNICAL_BACKUP/${exported.def.model}.json`;
    const csvName = `TECHNICAL_BACKUP/${exported.def.model}.csv`;
    put(jsonName, stableJson(exported.rows));
    put(csvName, rowsToCsv(exported.rows));
    const folder = `CLIENT_FILES/${exported.def.folder}`;
    put(`${folder}/${kebab(exported.def.model)}.csv`, rowsToCsv(exported.rows));
  }

  const customers = findModel(input.models, "Customer");
  const documents = findModel(input.models, "FinancialDocument");
  const payments = findModel(input.models, "Payment");
  const uploads = findModel(input.models, "DocumentUpload");

  if (customers) {
    put("CLIENT_FILES/CUSTOMERS/customers.csv", rowsToCsv(customers.rows));
    for (const customer of customers.rows) {
      const id = String(customer.id ?? "");
      const base = `CLIENT_FILES/CUSTOMERS/${id}`;
      put(`${base}/customer.json`, stableJson(customer));
      const relatedDocs = (documents?.rows ?? []).filter((d) => String(d.customerId ?? "") === id);
      const relatedPays = (payments?.rows ?? []).filter((p) => String(p.customerId ?? "") === id);
      const relatedUploads = (uploads?.rows ?? []).filter((u) =>
        relatedDocs.some((d) => String(d.id) === String(u.financialDocumentId ?? "")),
      );
      put(`${base}/related-records/financial-documents.json`, stableJson(relatedDocs.map((d) => d.id)));
      put(`${base}/related-records/payments.json`, stableJson(relatedPays.map((p) => p.id)));
      const filePointers = relatedUploads.map((u) => ({
        documentUploadId: u.id,
        storageBucket: u.storageBucket ?? null,
        storagePath: u.storagePath ?? null,
        see: "STORAGE/storage-manifest.csv",
      }));
      put(`${base}/documents/files-manifest.json`, stableJson(filePointers));
      const derived = buildCustomerDerivedLedger({
        customerId: id,
        openingBalance: customer.openingBalance,
        documents: relatedDocs,
        payments: relatedPays,
      });
      put(
        `${base}/ledger.csv`,
        `# ${derived.note}\n${rowsToCsv(derived.lines as unknown as Record<string, unknown>[])}`,
      );
    }
  }

  put(
    "CLIENT_FILES/FINANCE/COMPUTED_LEDGERS/README.md",
    `# COMPUTED_LEDGERS\n\n**DERIVED DATA**\n\nDo not restore from these files.\nSource of truth: TECHNICAL_BACKUP FinancialDocument, Payment, LedgerEntry, CashFlowEntry, CheckPayment, FinanceSettings.\n`,
  );

  if (customers) {
    for (const customer of customers.rows) {
      const id = String(customer.id ?? "");
      const derived = buildCustomerDerivedLedger({
        customerId: id,
        openingBalance: customer.openingBalance,
        documents: (documents?.rows ?? []).filter((d) => String(d.customerId ?? "") === id),
        payments: (payments?.rows ?? []).filter((p) => String(p.customerId ?? "") === id),
      });
      put(
        `CLIENT_FILES/FINANCE/COMPUTED_LEDGERS/customer-${id}.csv`,
        `# DERIVED DATA\n# ${derived.note}\n${rowsToCsv(derived.lines as unknown as Record<string, unknown>[])}`,
      );
    }
  }

  put("STORAGE/storage-manifest.csv", storageManifestCsv(input.storageManifest));
  for (const [path, bytes] of input.storageFiles) {
    const rel = path.startsWith("STORAGE/") ? path : `STORAGE/${path}`;
    put(rel, bytes);
  }

  const other = CLIENT_MODELS.filter((m) => m.folder === "OTHER");
  put(
    "CLIENT_FILES/OTHER/README.md",
    `# OTHER\n\nModels without a tighter domain folder. Still exported in full.\n\n${other.map((m) => `- ${m.model}`).join("\n")}\n`,
  );

  const fileNames = [...files.keys()].map((k) => k.slice(PACKAGE_ROOT.length + 1)).sort();
  const manifest = buildManifest({
    generatedAt: generatedAtIso,
    appVersion,
    models: input.models,
    storageManifest: input.storageManifest,
    fileNames,
  });
  put("manifest.json", stableJson(manifest));

  const zip = new JSZip();
  for (const [path, body] of files) {
    zip.file(path, body);
  }
  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const sha256 = createHash("sha256").update(zipBytes).digest("hex");
  const zipFileName = `WEGO_CLIENT_FULL_DATA_${dateStamp(generatedAt)}.zip`;

  return { files, zip: zipBytes, sha256, zipFileName, validation, manifest };
}

export function sha256FileName(zipFileName: string): string {
  return `${zipFileName}.sha256`;
}

export function sha256FileContents(sha256: string, zipFileName: string): string {
  return `${sha256}  ${zipFileName}\n`;
}
