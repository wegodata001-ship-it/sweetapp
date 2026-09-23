# Client data handover — audit map (stage 1)

READ ONLY. No Production export was executed.  
No DELETE / UPDATE / INSERT / UPSERT / TRUNCATE / DROP / ALTER.  
No migration. No balance change. No reconciliation.

## Isolation

- **MULTI-TENANT: NO**
- This is a single-business ERP (WEGO / הלאוויאת קודס).
- A few tables have `businessId` or `tenantId` defaulting to `"default"` for storage/email-contact scoping. They are not a second customer’s database.
- **CLIENT DATA ISOLATION: NOT APPLICABLE** (one business in this schema).

## Database

- Provider: PostgreSQL (`DATABASE_URL` / `DIRECT_URL` — names only).
- Prisma models: **71**
- Enums: **9**
- Record counts: **NOT AVAILABLE** (local `DATABASE_URL` unset; Production was not queried).

## Storage (files outside the DB)

| Provider | Env names (values not printed) | Client data | Needs export | Method |
|---|---|---|---|---|
| Supabase Storage | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_STORAGE_BUCKET`, `NEXT_PUBLIC_SUPABASE_REPORTS_BUCKET`, `WEGO_SOURCE_FILES_BUCKET`, `WEGO_DOCUMENTS_BUCKET` | YES | YES | List objects by path refs in DB; download via signed URL. Do not dump service-role key. |
| Reports bucket (default `wego-reports`) | same as above | YES | YES | Generated PDFs, task files (`reports/`, `task-files/`). |
| Source bucket (default `pdf_photo`) | same as above | YES | YES | Scanned invoices/receipts/Z-reports under `{TEN_*}/{income\|expense\|ocr\|zreport}/yyyy/MM/`. |

No S3, Vercel Blob, Cloudinary, or Firebase Storage found in code.

## External services (not a second database)

| Integration | Env names | Client-owned data | Needs export | Limitations |
|---|---|---|---|---|
| Resend email | `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | Partial (sent mail lives at Resend) | OPTIONAL | DB already has `EmailLog`, `AccountantEmailLog`. Do not export API key. |
| WhatsApp stub | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Unknown if unused | NO unless proven live | Stub notifier. |
| SMS stub | `SMS_PROVIDER` | Unknown | NO unless proven live | Stub. |
| Gemini OCR | `GEMINI_API_KEY`, `GEMINI_MODEL` | NO (processor) | NO | OCR text cached in `OcrCache`. |
| Cron | `CRON_SECRET` | NO | NO | Secret. |
| Auth | `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | NO | NO | Secrets. |

## Two export levels (proposed, not generated)

### A. Client-friendly

CSV / XLSX / print HTML the customer can open.  
Exclude hashes, sessions, reset tokens, secrets.

### B. Technical backup

`pg_dump` + `schema.prisma` + storage object copy + ID/FK/timestamps.  
Keep soft-deleted / cancelled / voided / archived rows.  
Still exclude env secrets. Password hashes only in a locked technical vault if the receiving developer requires restore — never in the client-friendly zip.

## Proposed package (after approval)

```
CLIENT_DATA_EXPORT/
├── README/
│   ├── DATA_DICTIONARY.md
│   └── EXPORT_SUMMARY.md
├── DATABASE/
│   ├── schema.prisma
│   └── full-database-backup.sql   (technical only)
├── CUSTOMERS/
├── SUPPLIERS/
├── EMPLOYEES/
├── USERS/                         (no passwordHash / session / reset tokens)
├── FINANCE/
├── ORDERS/
├── INVENTORY/
├── TASKS/
├── WORKFLOWS/
├── RECIPES/
├── DOCUMENTS/
├── FILES/                         (storage copies + MISSING SOURCE FILE log)
└── SYSTEM/
    ├── roles-permissions.csv
    ├── finance-settings.csv
    ├── enums.md
    └── count-reconciliation.csv   (SOURCE COUNT == EXPORT COUNT)
```

## Datasets to export

See `DATA_DICTIONARY.md`. All 71 models are classified there.

## Files to export

- `DocumentUpload.storagePath` + `storageBucket`
- `FinancialDocument.pdfStoragePath`
- `GeneratedPdf.pdfUrl`
- `GeneratedReport.filePath` / `publicUrl`
- `TaskFile.storagePath` / `fileUrl`
- `SystemReconciliationImport.filePath`

Missing storage objects → `MISSING SOURCE FILE` (do not invent).

## Data not safe to export (client-friendly)

- `User.passwordHash`
- `User.currentSessionId`
- `PasswordResetToken` (entire table)
- Env secrets listed above
- JWT / cookies / API keys / service-role key

## Missing / unmapped (not models)

- **Projects** — no model. Closest: `TaskGroup`, `WorkflowRun`, `FutureOrder`.
- **Meetings** — not found.
- **Signatures** — not found as a table.
- **Comments** — notes/reason fields on documents, tasks, attendance.

## Blockers for READY FOR FULL EXPORT

1. This stage forbids Production export until the map is approved.
2. Record counts were not taken (no local DB; Production not queried).
3. Storage listing was not executed (needs authorized Supabase, no secret printing).
4. File existence vs DB path reconciliation not run.

## Safety

- DB WRITES: 0
- PRODUCTION DATA MODIFIED: NO
- EXPORT EXECUTED: NO
- SECRETS EXCLUDED: YES
- PASSWORDS/TOKENS EXCLUDED: YES
