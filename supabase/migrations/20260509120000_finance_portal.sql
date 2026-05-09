create extension if not exists "pgcrypto";

-- Counterparties for ledger (supplier / client / employee)
create table if not exists public.finance_entities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('supplier', 'customer', 'employee')),
  name text not null,
  opening_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (entity_type, name)
);

create index if not exists finance_entities_type_idx on public.finance_entities (entity_type);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.finance_entities (id) on delete cascade,
  entry_date date not null,
  doc_type text not null default '',
  description text not null default '',
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_entity_date_idx
  on public.ledger_entries (entity_id, entry_date);

create table if not exists public.finance_settings (
  key text primary key,
  value_numeric numeric(14, 2),
  value_text text
);

insert into public.finance_settings (key, value_numeric)
values ('cash_opening_balance', 42180.90)
on conflict (key) do nothing;

create table if not exists public.cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  description text not null default '',
  inflow numeric(14, 2) not null default 0 check (inflow >= 0),
  outflow numeric(14, 2) not null default 0 check (outflow >= 0),
  is_direct boolean not null default false,
  created_at timestamptz not null default now(),
  constraint cash_flow_one_side_chk check (
    (inflow > 0 and outflow = 0) or (outflow > 0 and inflow = 0) or (inflow = 0 and outflow = 0)
  )
);

create index if not exists cash_flow_entries_date_idx on public.cash_flow_entries (entry_date);

create table if not exists public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  doc_date date,
  pdf_storage_path text not null,
  sent_to_cpa boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists finance_documents_created_idx on public.finance_documents (created_at desc);

-- Seed entities & ledger (aligned with prior demo data)
insert into public.finance_entities (entity_type, name, opening_balance)
values
  ('supplier', N'ספק קמח מרכזי', 18240.50),
  ('customer', N'רשת דרום', 9650.00),
  ('employee', N'עובד ייצור א׳', 3200.00)
on conflict (entity_type, name) do nothing;

-- Ledger movements per seeded entity
insert into public.ledger_entries (entity_id, entry_date, doc_type, description, debit, credit)
select e.id, v.entry_date::date, v.doc_type, v.description, v.debit::numeric, v.credit::numeric
from public.finance_entities e
cross join lateral (
  values
    ('supplier', '2026-05-01', N'חשבונית רכש', N'ספק קמח מרכזי — אספקה שבועית', 4100, 0),
    ('supplier', '2026-05-03', N'תשלום', N'העברה בנקאית לספק', 0, 8200),
    ('supplier', '2026-05-05', N'חשבונית רכש', N'חומרי אריזה חד פעמי', 1290.75, 0),
    ('supplier', '2026-05-07', N'זיכוי', N'החזרת סחורה פגומה', 0, 410),
    ('supplier', '2026-05-09', N'חשבונית רכש', N'שמנת וחמאה לייצור', 2680, 0),
    ('customer', '2026-05-02', N'חשבונית מס', N'משלוח קונדיטוריה — רשת דרום', 0, 5400),
    ('customer', '2026-05-04', N'קבלה', N'תשלום מזומן — חשבונית 9921', 3200, 0),
    ('customer', '2026-05-06', N'חשבונית זיכוי', N'ביטול פריטים באירוע', 890, 0),
    ('customer', '2026-05-08', N'הזמנת אירוע', N'פיקדון מגשים — גן אירועים שמשון', 0, 1800),
    ('customer', '2026-05-09', N'קבלה', N'סגירת יתרה — העברה בנקאית', 4500, 0),
    ('employee', '2026-05-01', N'משכורת', N'שכר בסיס — עובד ייצור א׳', 6200, 0),
    ('employee', '2026-05-01', N'שווי הטבות', N'ארוחות במפעל', 420, 0),
    ('employee', '2026-05-05', N'מקדמה', N'מקדמה על חשבון שכר', 0, 1500),
    ('employee', '2026-05-09', N'נסיעות', N'החזר נסיעות שבועי', 380, 0)
) as v(entity_type, entry_date, doc_type, description, debit, credit)
where e.entity_type = v.entity_type::text
and not exists (select 1 from public.ledger_entries limit 1);

insert into public.cash_flow_entries (entry_date, description, inflow, outflow, is_direct)
select v.entry_date::date, v.description, v.inflow::numeric, v.outflow::numeric, v.is_direct::boolean
from (
  values
    ('2026-05-09', N'פתיחת קופת מזומן בוקר + הפקדה אתמול', 5200, 0, false),
    ('2026-05-09', N'משלוח לקוח מוסדי — חשבונית מס 9044', 8760, 0, false),
    ('2026-05-09', N'דוח Z קופה — סיכום יום קודם (מזומן + אשראי)', 13240, 0, false),
    ('2026-05-09', N'תשלום ספק חלב וחמאה — העברה בנקאית', 0, 6890, false),
    ('2026-05-09', N'שירות שילוח דחופים — כרטיס אשראי עסקי', 0, 1240, false),
    ('2026-05-09', N'קיזוז פיקדון מגשים — החזר ללקוח אירוע', 0, 900, false),
    ('2026-05-09', N'קבלת תשלום זיכוי מספק אריזות', 630, 0, false)
) as v(entry_date, description, inflow, outflow, is_direct)
where not exists (select 1 from public.cash_flow_entries limit 1);

-- Row level security (permissive for dashboard-style anon access)
alter table public.finance_entities enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.finance_settings enable row level security;
alter table public.cash_flow_entries enable row level security;
alter table public.finance_documents enable row level security;

drop policy if exists "finance_entities_rw" on public.finance_entities;
drop policy if exists "ledger_entries_rw" on public.ledger_entries;
drop policy if exists "finance_settings_rw" on public.finance_settings;
drop policy if exists "cash_flow_entries_rw" on public.cash_flow_entries;
drop policy if exists "finance_documents_rw" on public.finance_documents;

create policy "finance_entities_rw" on public.finance_entities for all using (true) with check (true);
create policy "ledger_entries_rw" on public.ledger_entries for all using (true) with check (true);
create policy "finance_settings_rw" on public.finance_settings for all using (true) with check (true);
create policy "cash_flow_entries_rw" on public.cash_flow_entries for all using (true) with check (true);
create policy "finance_documents_rw" on public.finance_documents for all using (true) with check (true);

-- Storage bucket for generated PDFs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-docs', 'finance-docs', true, 52428800, array['application/pdf'::text])
on conflict (id) do update set public = excluded.public;

drop policy if exists "finance_docs_select" on storage.objects;
drop policy if exists "finance_docs_insert" on storage.objects;
drop policy if exists "finance_docs_update" on storage.objects;
drop policy if exists "finance_docs_delete" on storage.objects;

create policy "finance_docs_select" on storage.objects for select using (bucket_id = 'finance-docs');
create policy "finance_docs_insert" on storage.objects for insert with check (bucket_id = 'finance-docs');
create policy "finance_docs_update" on storage.objects for update using (bucket_id = 'finance-docs');
create policy "finance_docs_delete" on storage.objects for delete using (bucket_id = 'finance-docs');
