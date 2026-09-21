-- Run once in Supabase SQL Editor. Review before running in production.
create table if not exists public.internal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null unique check (employee_id ~ '^[A-Za-z0-9_-]{1,30}$'),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  department text not null check (char_length(department) between 1 and 100),
  email text not null unique check (lower(email) like '%@kumtsu.com'),
  internal_phone text check (internal_phone is null or char_length(internal_phone) <= 30),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.internal_profiles enable row level security;
revoke all on public.internal_profiles from anon;
revoke update on public.internal_profiles from authenticated;
grant select on public.internal_profiles to authenticated;
grant update (first_name, last_name, department, internal_phone, avatar_path, updated_at)
on public.internal_profiles to authenticated;

drop policy if exists "members read own profile" on public.internal_profiles;
create policy "members read own profile" on public.internal_profiles for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "members update own profile" on public.internal_profiles;
create policy "members update own profile" on public.internal_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('internal-profiles', 'internal-profiles', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members view own avatar" on storage.objects;
create policy "members view own avatar" on storage.objects for select to authenticated
using (bucket_id = 'internal-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "members upload own avatar" on storage.objects;
create policy "members upload own avatar" on storage.objects for insert to authenticated
with check (bucket_id = 'internal-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "members update own avatar" on storage.objects;
create policy "members update own avatar" on storage.objects for update to authenticated
using (bucket_id = 'internal-profiles' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'internal-profiles' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- After creating an Auth user in Supabase, IT inserts one matching profile row:
-- insert into public.internal_profiles
-- (user_id, employee_id, first_name, last_name, department, email)
-- values ('AUTH-USER-UUID', '1261', 'ชื่อ', 'นามสกุล', 'IT', 'name@kumtsu.com');
