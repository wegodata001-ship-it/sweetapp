import {
  APPROVED_MAP_CLIENT_COUNT,
  CLIENT_MODELS,
  EXCLUDED_MODELS,
  EXPORT_CURRENCY,
  USER_EXCLUDED_FIELDS,
} from "./catalog";
import type { ValidationReport } from "./validate";
import type { StorageManifestRow } from "./storage";
import { storageSummary } from "./storage";

export function handoverReadme(): string {
  return `# WEGO client full data export

This package is a **read-only snapshot** of business data for handover.
It is **not** permission to delete Production. After this zip is created,
the live system must keep running until a separate decommission step.

Currency: **${EXPORT_CURRENCY}**. Multi-tenant: **NO** (single business).

## Package layout

\`\`\`
WEGO_CLIENT_FULL_DATA/
├── README.md                 ← this file
├── manifest.json             ← models, counts, files, exclusions
├── DATA_DICTIONARY.md        ← field-level map of every model
├── EXPORT_SUMMARY.md
├── VALIDATION_REPORT.md
├── TECHNICAL_BACKUP/         ← machine-readable JSON (+ CSV) per model
├── CLIENT_FILES/             ← human-readable folders by domain
└── STORAGE/                  ← downloaded files + storage-manifest.csv
\`\`\`

## How to find a dataset

1. Look up the model in \`DATA_DICTIONARY.md\`.
2. Technical restore source: \`TECHNICAL_BACKUP/<Model>.json\`.
3. Spreadsheet view: \`TECHNICAL_BACKUP/<Model>.csv\` and \`CLIENT_FILES/<FOLDER>/\`.
4. Uncategorized models live under \`CLIENT_FILES/OTHER/\` (none should be dropped).

Folders:

${CLIENT_MODELS.map((m) => `- \`${m.folder}/\` — ${m.model}`).join("\n")}

## Relations

Keep original IDs. Foreign keys are not rewritten.

Important chains:

- Customer → FinancialDocument → FinancialDocumentItem
- Customer → Payment → CheckPayment
- Supplier → LedgerEntry / FinancialDocument (expense) / SupplierProduct
- Employee → LedgerEntry / EmployeeTask*
- FutureOrder → OrderPayment (cashflow only — not customer ledger)
- InventoryCountSession → InventoryCount → InventoryCountWorker
- User → UserPermission (passwords and session IDs are stripped)

Broken FKs are listed in \`VALIDATION_REPORT.md\`. They are **not** auto-fixed.

## Exclusions (never in this package)

Entire table:

${EXCLUDED_MODELS.map((m) => `- ${m}`).join("\n")}

User fields:

${USER_EXCLUDED_FIELDS.map((f) => `- User.${f}`).join("\n")}

Environment / secrets (never exported, never printed to logs):

- DATABASE_URL, DIRECT_URL
- JWT_SECRET, SUPER_ADMIN_PASSWORD
- SUPABASE_SERVICE_ROLE_KEY, API keys
- session tokens, cookies
- email / payment / cron / OAuth secrets

## Financial data

\`CLIENT_FILES/FINANCE/\` holds **source records**:

- Payments
- FinancialDocument + items
- LedgerEntry
- CashFlowEntry
- opening balances (Customer / Supplier / Employee / FinanceSettings)
- credit notes / fees / adjustments (as document types on FinancialDocument)
- CheckPayment + notification history
- accountant transfer / email logs
- SystemReconciliation* import history

\`CLIENT_FILES/FINANCE/COMPUTED_LEDGERS/\` and per-customer \`ledger.csv\`
are **DERIVED DATA**. Do not restore from them. Recalculate from source JSON.

Amounts are decimal **strings** (example \`"1234.56"\`) plus implicit currency ILS.

## Inventory

Full history is in TECHNICAL_BACKUP and \`CLIENT_FILES/INVENTORY/\`:

- Products, categories, warehouses, locations
- current / minimum quantities
- InventoryCountSession, InventoryCount, workers, exclusions
- InventoryMovement

This is not a current-stock snapshot only.

## Storage files

\`STORAGE/storage-manifest.csv\` maps DB record → exported file.

Statuses:

- EXPORTED
- MISSING_SOURCE_FILE — DB reference exists, object was not in the bucket (no fake placeholder)
- NOT_ACCESSIBLE — credentials missing or download denied (fail-closed)
- INVALID_REFERENCE — empty / unparseable path and no configured bucket

Do not treat a missing file as the original.

## Restore considerations

1. Restore TECHNICAL_BACKUP JSON (or a future Prisma/SQL load) **before** files.
2. Preserve IDs. Do not regenerate cuids if you need the same relations.
3. Re-hash passwords; this export has no password hashes. Users cannot log in
   from this zip until new credentials are set.
4. Sessions must be issued fresh (\`currentSessionId\` was excluded).
5. Recreate PasswordResetToken rows only if a new reset flow is needed — table was excluded.
6. Upload STORAGE/files objects back to the buckets named in the manifest.
7. Recompute ledgers from source finance tables; ignore COMPUTED_LEDGERS.

## Derived vs source

| Path | Kind |
|---|---|
| TECHNICAL_BACKUP/*.json | SOURCE |
| CLIENT_FILES/FINANCE/*.csv (except COMPUTED_LEDGERS) | SOURCE (same rows) |
| CLIENT_FILES/FINANCE/COMPUTED_LEDGERS/ | DERIVED |
| CLIENT_FILES/CUSTOMERS/<id>/ledger.csv | DERIVED |
| STORAGE/files | SOURCE bytes when status=EXPORTED |

## Count check

For every client model, \`SOURCE COUNT == EXPORTED COUNT\` must hold
(except the excluded PasswordResetToken table). See VALIDATION_REPORT.md.
`;
}

export function exportSummaryMd(input: {
  generatedAt: string;
  exportVersion: string;
  appVersion: string;
  modelCount: number;
  storage: ReturnType<typeof storageSummary>;
  validation: ValidationReport;
  realExport: boolean;
}): string {
  return `# Export summary

- Generated at: ${input.generatedAt}
- Export version: ${input.exportVersion}
- Application version: ${input.appVersion}
- Approved map client models: ${APPROVED_MAP_CLIENT_COUNT}
- Models in this package: ${input.modelCount}
- Currency: ${EXPORT_CURRENCY}
- Real Production export: ${input.realExport ? "YES" : "NO"}
- Production data modified: NO
- DB writes: 0

## Counts

${input.validation.counts.map((c) => `- ${c.model}: source ${c.sourceCount} / exported ${c.exportedCount} — ${c.status}`).join("\n")}

Overall count reconciliation: ${input.validation.countsPass ? "PASS" : "FAIL"}

## Relations

- Valid FK hits: ${input.validation.relationsValid}
- BROKEN FOREIGN REFERENCES: ${input.validation.relationsBroken}

## Storage

- Referenced: ${input.storage.referenced}
- Exported: ${input.storage.exported}
- Missing source file: ${input.storage.missing}
- Not accessible: ${input.storage.notAccessible}
- Invalid reference: ${input.storage.invalid}

## Safety

- Password hashes excluded: ${input.validation.passwordsExcluded ? "YES" : "NO"}
- Session data excluded: YES
- PasswordResetToken excluded: ${input.validation.passwordResetTokensExcluded ? "YES" : "NO"}
- Secrets excluded: ${input.validation.secretsExcluded ? "YES" : "NO"}
`;
}

export function validationReportMd(input: {
  validation: ValidationReport;
  storage: ReturnType<typeof storageSummary>;
  manifest: StorageManifestRow[];
}): string {
  const v = input.validation;
  const broken =
    v.brokenForeignReferences.length === 0
      ? "None."
      : v.brokenForeignReferences
          .map(
            (b) =>
              `- ${b.model}.${b.field} record ${b.recordId} → ${b.targetModel} "${b.value}"`,
          )
          .join("\n");

  return `# Validation report

## Models

- Client models expected (approved map): ${v.expectedClientModels}
- Client models covered: ${v.coveredClientModels}
- Prisma models excluded entirely: ${EXCLUDED_MODELS.join(", ")}

## Per-model counts

| Model | SOURCE | EXPORTED | STATUS |
|---|---:|---:|---|
${v.counts.map((c) => `| ${c.model} | ${c.sourceCount} | ${c.exportedCount} | ${c.status} |`).join("\n")}

Count reconciliation: **${v.countsPass ? "PASS" : "FAIL"}**

## Storage

| Metric | Count |
|---|---:|
| REFERENCED | ${input.storage.referenced} |
| EXPORTED | ${input.storage.exported} |
| MISSING | ${input.storage.missing} |
| NOT ACCESSIBLE | ${input.storage.notAccessible} |
| INVALID REFERENCE | ${input.storage.invalid} |

Missing / inaccessible rows are listed in \`STORAGE/storage-manifest.csv\`.
MISSING SOURCE FILE is reported; no placeholder object is created.

## Relations

- VALID: ${v.relationsValid}
- BROKEN: ${v.relationsBroken}

### BROKEN FOREIGN REFERENCES

${broken}

References were **not** rewritten.

## Secrets / auth

- Secrets: ${v.secretsExcluded ? "EXCLUDED" : "LEAK"}
- Passwords: ${v.passwordsExcluded ? "EXCLUDED" : "LEAK"}
- Password reset tokens: ${v.passwordResetTokensExcluded ? "EXCLUDED" : "LEAK"}
- User.currentSessionId: EXCLUDED
`;
}
