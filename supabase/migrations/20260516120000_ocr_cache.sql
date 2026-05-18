-- OCR result cache (SHA-256 of file bytes → extracted text)
create table if not exists public.ocr_cache (
  file_hash text primary key,
  raw_text text not null,
  confidence double precision not null default 0,
  engine text not null default 'ocr_space',
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists ocr_cache_last_used_idx on public.ocr_cache (last_used_at desc);
