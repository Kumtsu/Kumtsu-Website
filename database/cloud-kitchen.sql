-- Card 08: Kumtsu & CloudKitchen. All access is mediated by protected Vercel APIs.

create table if not exists public.cloud_kitchen_branches (
  branch_code text primary key check (branch_code ~ '^BR[0-9]{3}$'),
  data jsonb not null default '{}'::jsonb,
  updated_by_email text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_kitchen_clients (
  id bigint generated always as identity primary key,
  brand text not null unique check (char_length(brand) between 1 and 160),
  customer text not null default '',
  address text not null default '',
  phone text not null default '',
  logo_url text not null default '',
  contract_path text,
  contract_name text,
  payment_path text,
  payment_name text,
  created_by_email text not null,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_kitchen_documents (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.cloud_kitchen_clients(id) on delete cascade,
  document_name text not null check (char_length(document_name) between 1 and 220),
  document_type text not null check (document_type in ('contract','payment','other')),
  object_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 220),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  byte_size integer check (byte_size between 1 and 3145728),
  created_by_email text not null,
  created_at timestamptz not null default now()
);

create index if not exists cloud_kitchen_clients_brand_idx on public.cloud_kitchen_clients (brand);
create index if not exists cloud_kitchen_documents_client_created_idx on public.cloud_kitchen_documents (client_id, created_at desc);
create index if not exists cloud_kitchen_documents_type_idx on public.cloud_kitchen_documents (document_type);

alter table public.cloud_kitchen_branches enable row level security;
alter table public.cloud_kitchen_clients enable row level security;
alter table public.cloud_kitchen_documents enable row level security;
revoke all on table public.cloud_kitchen_branches, public.cloud_kitchen_clients, public.cloud_kitchen_documents from anon, authenticated;
grant select, insert, update, delete on table public.cloud_kitchen_branches, public.cloud_kitchen_clients, public.cloud_kitchen_documents to service_role;
grant usage, select on all sequences in schema public to service_role;

insert into public.cloud_kitchen_documents
  (client_id, document_name, document_type, object_path, original_filename, mime_type, byte_size, created_by_email, created_at)
select id, coalesce(nullif(contract_name,''), 'สัญญา Cloud Kitchen'), 'contract', contract_path,
  coalesce(nullif(contract_name,''), 'legacy-contract.pdf'), 'application/pdf', null,
  coalesce(nullif(updated_by_email,''), created_by_email), coalesce(updated_at, created_at)
from public.cloud_kitchen_clients
where contract_path is not null and contract_path <> ''
on conflict (object_path) do nothing;

insert into public.cloud_kitchen_documents
  (client_id, document_name, document_type, object_path, original_filename, mime_type, byte_size, created_by_email, created_at)
select id, coalesce(nullif(payment_name,''), 'เอกสารการชำระเงิน'), 'payment', payment_path,
  coalesce(nullif(payment_name,''), 'legacy-payment.pdf'), 'application/pdf', null,
  coalesce(nullif(updated_by_email,''), created_by_email), coalesce(updated_at, created_at)
from public.cloud_kitchen_clients
where payment_path is not null and payment_path <> ''
on conflict (object_path) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cloud-kitchen-documents', 'cloud-kitchen-documents', false, 3145728, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=3145728,
  allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp'];

comment on table public.cloud_kitchen_branches is 'Card 08: per-branch owned brands, Cloud Kitchen brands, hours and capacity';
comment on table public.cloud_kitchen_clients is 'Card 08: Cloud Kitchen client master data and private document references';
comment on table public.cloud_kitchen_documents is 'Card 08: unlimited private PDF documents attached to Cloud Kitchen clients';

insert into public.cloud_kitchen_branches (branch_code, data, updated_by_email)
values (
  'BR051',
  '{"type":"สาขาบริษัท","staff":0,"am":"ยังไม่ระบุ","ck":[],"owned":["คุ้มสึ","ไก่ทอดแอนโทนี","หมีปุ้ง หมูปิ้งโบราณ","โซ้ย นู้ดเดิ้ล","นัวนัว สุกี้แห้ง"],"openTime":"","closeTime":"","status":"unset","capacity":0}'::jsonb,
  'system@kumtsu.com'
)
on conflict (branch_code) do nothing;
