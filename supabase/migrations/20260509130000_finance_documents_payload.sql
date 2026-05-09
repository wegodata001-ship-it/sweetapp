-- Store full form state as JSON; PDF generation removed — pdf_storage_path optional for legacy rows.
alter table public.finance_documents
  alter column pdf_storage_path drop not null;

alter table public.finance_documents
  alter column pdf_storage_path set default '';

alter table public.finance_documents
  add column if not exists payload jsonb not null default '{}'::jsonb;
