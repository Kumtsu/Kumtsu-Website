create table if not exists public.web_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  status text not null default 'new' check (status in ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled')),
  brand_id text not null,
  brand_name text not null,
  fulfilment_method text not null check (fulfilment_method in ('delivery', 'pickup')),
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_phone text not null check (char_length(customer_phone) between 8 and 30),
  customer_address text,
  customer_note text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed', 'not_configured')),
  notification_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_orders_created_at_idx on public.web_orders (created_at desc);
create index if not exists web_orders_status_created_at_idx on public.web_orders (status, created_at desc);
create index if not exists web_orders_customer_phone_idx on public.web_orders (customer_phone);

alter table public.web_orders enable row level security;
revoke all on table public.web_orders from anon, authenticated;
grant all on table public.web_orders to service_role;

create or replace function public.set_web_orders_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_web_orders_updated_at on public.web_orders;
create trigger set_web_orders_updated_at
before update on public.web_orders
for each row execute function public.set_web_orders_updated_at();
