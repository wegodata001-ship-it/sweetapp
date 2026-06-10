-- Private bucket for business source documents (invoices, receipts, OCR scans)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wego-documents',
  'wego-documents',
  false,
  52428800,
  array[
    'application/pdf'::text,
    'image/jpeg'::text,
    'image/jpg'::text,
    'image/png'::text,
    'image/webp'::text
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No public read policies — access only via service role signed URLs from the app API
