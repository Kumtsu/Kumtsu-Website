-- Kumtsu Branch Access data is only reachable through server-side API routes.
-- Browser clients never receive the Supabase service-role credential.

create table if not exists public.branch_access_branches (
  id bigint primary key,
  code text not null unique,
  name text not null,
  address text not null default '',
  phone text not null default '',
  coordinates text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.branch_access_brands (
  id bigint primary key,
  branch_id bigint not null references public.branch_access_branches(id) on delete cascade,
  name text not null,
  code text not null default '',
  login_identifier text not null default '',
  password_encrypted text not null,
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table if not exists public.branch_access_channels (
  id bigint primary key,
  brand_id bigint not null references public.branch_access_brands(id) on delete cascade,
  name text not null,
  login_identifier text not null default '',
  password_encrypted text not null,
  updated_at timestamptz not null default now(),
  unique (brand_id, name)
);

create table if not exists public.branch_access_audit (
  id bigint generated always as identity primary key,
  actor_email text not null,
  entity_type text not null,
  entity_id bigint not null,
  changes jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists branch_access_brands_branch_idx on public.branch_access_brands(branch_id);
create index if not exists branch_access_channels_brand_idx on public.branch_access_channels(brand_id);
create index if not exists branch_access_audit_created_idx on public.branch_access_audit(created_at desc);

alter table public.branch_access_branches enable row level security;
alter table public.branch_access_brands enable row level security;
alter table public.branch_access_channels enable row level security;
alter table public.branch_access_audit enable row level security;

revoke all on table public.branch_access_branches from anon, authenticated;
revoke all on table public.branch_access_brands from anon, authenticated;
revoke all on table public.branch_access_channels from anon, authenticated;
revoke all on table public.branch_access_audit from anon, authenticated;

grant select, insert, update, delete on table public.branch_access_branches to service_role;
grant select, insert, update, delete on table public.branch_access_brands to service_role;
grant select, insert, update, delete on table public.branch_access_channels to service_role;
grant select, insert on table public.branch_access_audit to service_role;
grant usage, select on sequence public.branch_access_audit_id_seq to service_role;

comment on table public.branch_access_branches is 'Card 04: branch master data for internal credential access';
comment on table public.branch_access_brands is 'Card 04: per-branch brand credentials encrypted by the application';
comment on table public.branch_access_channels is 'Card 04: per-brand sales-channel credentials encrypted by the application';
comment on table public.branch_access_audit is 'Card 04: immutable server-side edit audit trail';
