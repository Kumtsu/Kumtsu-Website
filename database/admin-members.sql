-- Admin/member approval extension. Run in Supabase SQL Editor after internal-members.sql.
alter table public.internal_profiles
add column if not exists status text not null default 'active';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'internal_profiles_status_check'
      and conrelid = 'public.internal_profiles'::regclass
  ) then
    alter table public.internal_profiles
    add constraint internal_profiles_status_check check (status in ('pending','active','rejected'));
  end if;
end $$;

create table if not exists public.internal_member_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  employee_id text not null unique check (employee_id ~ '^[A-Za-z0-9_-]{1,30}$'),
  department text not null check (char_length(department) between 1 and 100),
  email text not null unique check (lower(email) like '%@kumtsu.com'),
  phone text check (phone is null or char_length(phone) <= 30),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  notification_status text not null default 'pending' check (notification_status in ('pending','sent','failed')),
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create index if not exists internal_member_requests_status_created_idx
on public.internal_member_requests (status, created_at desc);

create index if not exists internal_member_requests_auth_user_id_idx
on public.internal_member_requests (auth_user_id);

alter table public.internal_member_requests enable row level security;
revoke all on public.internal_member_requests from anon, authenticated;

-- Member self-access remains restricted to the owner's row. Status is intentionally
-- not granted as an updatable column to authenticated users.
revoke update on public.internal_profiles from authenticated;
grant update (first_name, last_name, department, internal_phone, avatar_path, updated_at)
on public.internal_profiles to authenticated;
