-- Card 06: Kumtsu Maintenance. Browser clients use the protected Vercel API;
-- only the service role can access these tables through the Data API.

create table if not exists public.maintenance_jobs (
  id bigint generated always as identity primary key,
  branch text not null check (char_length(branch) between 1 and 120),
  job_type text not null check (char_length(job_type) between 1 and 120),
  scheduled_date date not null,
  scheduled_time time not null default '09:00',
  assigned_to text[] not null default '{}',
  title text not null check (char_length(title) between 1 and 180),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'waiting' check (status in ('waiting', 'progress', 'overdue', 'approval', 'completed', 'cancelled')),
  created_by_email text not null,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_job_history (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.maintenance_jobs(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by_email text not null,
  changed_at timestamptz not null default now()
);

create index if not exists maintenance_jobs_scheduled_date_idx on public.maintenance_jobs(scheduled_date);
create index if not exists maintenance_jobs_status_date_idx on public.maintenance_jobs(status, scheduled_date);
create index if not exists maintenance_jobs_branch_date_idx on public.maintenance_jobs(branch, scheduled_date);
create index if not exists maintenance_jobs_assigned_to_idx on public.maintenance_jobs using gin(assigned_to);
create index if not exists maintenance_job_history_job_changed_idx on public.maintenance_job_history(job_id, changed_at desc);

create or replace function public.log_maintenance_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.maintenance_job_history (job_id, from_status, to_status, changed_by_email)
    values (new.id, case when tg_op = 'UPDATE' then old.status else null end, new.status, new.updated_by_email);
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_status_history_trigger on public.maintenance_jobs;
create trigger maintenance_status_history_trigger
after insert or update of status on public.maintenance_jobs
for each row execute function public.log_maintenance_status_change();

alter table public.maintenance_jobs enable row level security;
alter table public.maintenance_job_history enable row level security;

revoke all on table public.maintenance_jobs from anon, authenticated;
revoke all on table public.maintenance_job_history from anon, authenticated;
revoke execute on function public.log_maintenance_status_change() from public, anon, authenticated;

grant select, insert, update, delete on table public.maintenance_jobs to service_role;
grant select, insert on table public.maintenance_job_history to service_role;
grant usage, select on sequence public.maintenance_jobs_id_seq to service_role;
grant usage, select on sequence public.maintenance_job_history_id_seq to service_role;

comment on table public.maintenance_jobs is 'Card 06: branch maintenance work orders';
comment on table public.maintenance_job_history is 'Card 06: immutable maintenance status audit trail';

create table if not exists public.maintenance_technicians (
  technician_key text primary key,
  display_name text not null,
  user_id uuid unique references auth.users(id),
  email text unique,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.maintenance_technicians (technician_key, display_name)
values ('นอส', 'อนวัช เพ็งมีศรี (นอส)'), ('เอฟ', 'กนกพล น้อยเพ็ง (เอฟ)'), ('ขวัญ', 'ปริญญา ปัญญายงค์ (ขวัญ)')
on conflict (technician_key) do update set display_name = excluded.display_name;

create table if not exists public.maintenance_job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null references public.maintenance_jobs(id) on delete cascade,
  bucket_id text not null,
  object_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  uploaded_by_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_job_attachments_job_idx on public.maintenance_job_attachments(job_id, created_at);
alter table public.maintenance_technicians enable row level security;
alter table public.maintenance_job_attachments enable row level security;
revoke all on table public.maintenance_technicians from anon, authenticated;
revoke all on table public.maintenance_job_attachments from anon, authenticated;
grant select, insert, update on table public.maintenance_technicians to service_role;
grant select, insert, delete on table public.maintenance_job_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maintenance-closeouts', 'maintenance-closeouts', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.finalize_maintenance_close(
  p_job_id bigint, p_bucket_id text, p_object_path text, p_original_filename text,
  p_mime_type text, p_byte_size integer, p_actor_email text
) returns setof public.maintenance_jobs
language plpgsql security invoker set search_path = public
as $$
begin
  insert into public.maintenance_job_attachments
    (job_id, bucket_id, object_path, original_filename, mime_type, byte_size, uploaded_by_email)
  values (p_job_id, p_bucket_id, p_object_path, p_original_filename, p_mime_type, p_byte_size, p_actor_email);
  return query update public.maintenance_jobs
    set status = 'completed', updated_by_email = p_actor_email, updated_at = now()
    where id = p_job_id and status not in ('completed', 'cancelled') returning *;
  if not found then raise exception 'Job cannot be closed'; end if;
end;
$$;
revoke execute on function public.finalize_maintenance_close(bigint,text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.finalize_maintenance_close(bigint,text,text,text,text,integer,text) to service_role;

create or replace function public.complete_maintenance_job(p_job_id bigint, p_actor_email text)
returns setof public.maintenance_jobs
language plpgsql security invoker set search_path = public
as $$
begin
  if not exists (select 1 from public.maintenance_job_attachments where job_id = p_job_id) then
    raise exception 'Close-out image is required';
  end if;
  return query update public.maintenance_jobs
    set status = 'completed', updated_by_email = p_actor_email, updated_at = now()
    where id = p_job_id and status not in ('completed', 'cancelled') returning *;
  if not found then raise exception 'Job cannot be closed'; end if;
end;
$$;
revoke execute on function public.complete_maintenance_job(bigint,text) from public, anon, authenticated;
grant execute on function public.complete_maintenance_job(bigint,text) to service_role;

-- Safe upgrade for Card 06 databases created before appointment time was added.
alter table public.maintenance_jobs
  add column if not exists scheduled_time time not null default '09:00';

-- Safe upgrade for Card 06 databases created before audited cancellation.
alter table public.maintenance_jobs drop constraint if exists maintenance_jobs_status_check;
alter table public.maintenance_jobs
  add constraint maintenance_jobs_status_check
  check (status in ('waiting', 'progress', 'overdue', 'approval', 'completed', 'cancelled'));
