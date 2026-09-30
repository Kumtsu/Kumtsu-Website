create table if not exists public.menu_catalog (
  id text primary key,
  catalog jsonb not null check (jsonb_typeof(catalog) = 'object'),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_catalog enable row level security;
revoke all on table public.menu_catalog from anon, authenticated;
grant select, insert, update, delete on table public.menu_catalog to service_role;

create or replace function public.set_menu_catalog_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_menu_catalog_updated_at on public.menu_catalog;
create trigger set_menu_catalog_updated_at
before update on public.menu_catalog
for each row execute function public.set_menu_catalog_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 1572864, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
