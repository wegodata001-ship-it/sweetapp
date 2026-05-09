create extension if not exists "pgcrypto";

create table if not exists public."HR_Attendance" (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  "date" date not null default current_date,
  clock_in_time timestamptz,
  clock_in_location jsonb,
  clock_out_time timestamptz,
  clock_out_location jsonb,
  note text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_attendance_status_chk
    check (status in ('ACTIVE', 'COMPLETED'))
);

create index if not exists hr_attendance_employee_date_idx
  on public."HR_Attendance" (employee_id, "date");

create index if not exists hr_attendance_status_idx
  on public."HR_Attendance" (status);

create or replace function public.set_hr_attendance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_hr_attendance_updated_at on public."HR_Attendance";

create trigger trg_set_hr_attendance_updated_at
before update on public."HR_Attendance"
for each row
execute function public.set_hr_attendance_updated_at();
