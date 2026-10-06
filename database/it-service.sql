-- Card 07: Kumtsu IT Service Desk. Access is only through protected Vercel APIs.

create table if not exists public.it_jobs (
  id bigint generated always as identity primary key,
  request_date date not null default current_date,
  requester_user_id uuid not null references auth.users(id),
  requester_email text not null,
  requester_name text not null,
  position text not null check (position in ('พนักงานหน้าสาขา','AM','OM','ACC','HR','Audit','Admin','Marketing','IT','Purchase','Inventory','Production','QC','Owner')),
  branch text not null check (char_length(branch) between 1 and 120),
  issue_type text not null check (char_length(issue_type) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  status text not null default 'waiting' check (status in ('waiting','progress','urgent','completed')),
  assigned_to text[] not null default '{}',
  scheduled_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_email text
);

create table if not exists public.it_inventory_items (
  id bigint generated always as identity primary key,
  equipment_type text not null check (char_length(equipment_type) between 1 and 120),
  brand text not null check (char_length(brand) between 1 and 120),
  model text not null check (char_length(model) between 1 and 180),
  serial_number text,
  quantity integer not null default 1 check (quantity >= 0),
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  branch text not null check (char_length(branch) between 1 and 120),
  storage_location text not null default '',
  status text not null default 'available' check (status in ('available','repair','retired')),
  note text not null default '',
  created_by_email text not null,
  updated_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists it_inventory_serial_unique_idx
  on public.it_inventory_items (serial_number) where serial_number is not null and serial_number <> '';

create table if not exists public.it_job_inventory_issues (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.it_jobs(id) on delete cascade,
  inventory_item_id bigint not null references public.it_inventory_items(id),
  quantity integer not null check (quantity > 0),
  old_device_status text not null default 'not_required' check (old_device_status in ('not_required','pending_return','repair','returned_to_stock')),
  issued_by_email text not null,
  issued_at timestamptz not null default now(),
  returned_at timestamptz
);

create table if not exists public.it_job_history (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.it_jobs(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  changed_by_email text not null,
  changed_at timestamptz not null default now()
);

create index if not exists it_jobs_request_date_idx on public.it_jobs(request_date desc);
create index if not exists it_jobs_status_date_idx on public.it_jobs(status, request_date desc);
create index if not exists it_jobs_branch_idx on public.it_jobs(branch);
create index if not exists it_jobs_requester_user_idx on public.it_jobs(requester_user_id);
create index if not exists it_inventory_type_branch_idx on public.it_inventory_items(equipment_type, branch);
create index if not exists it_inventory_status_idx on public.it_inventory_items(status);
create index if not exists it_job_inventory_job_idx on public.it_job_inventory_issues(job_id, issued_at);
create index if not exists it_job_inventory_item_idx on public.it_job_inventory_issues(inventory_item_id);
create index if not exists it_job_history_job_idx on public.it_job_history(job_id, changed_at desc);

alter table public.it_jobs enable row level security;
alter table public.it_inventory_items enable row level security;
alter table public.it_job_inventory_issues enable row level security;
alter table public.it_job_history enable row level security;

revoke all on table public.it_jobs, public.it_inventory_items, public.it_job_inventory_issues, public.it_job_history from anon, authenticated;
grant select, insert, update, delete on table public.it_jobs, public.it_inventory_items, public.it_job_inventory_issues, public.it_job_history to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.issue_it_inventory(
  p_job_id bigint, p_inventory_item_id bigint, p_quantity integer, p_actor_email text
) returns public.it_job_inventory_issues
language plpgsql security invoker set search_path = public
as $$
declare
  v_type text;
  v_issue public.it_job_inventory_issues;
begin
  if p_quantity < 1 then raise exception 'Quantity must be positive'; end if;
  update public.it_inventory_items
    set quantity = quantity - p_quantity, updated_by_email = p_actor_email, updated_at = now()
    where id = p_inventory_item_id and status = 'available' and quantity >= p_quantity
    returning equipment_type into v_type;
  if not found then raise exception 'Insufficient inventory'; end if;
  insert into public.it_job_inventory_issues
    (job_id, inventory_item_id, quantity, old_device_status, issued_by_email)
  values
    (p_job_id, p_inventory_item_id, p_quantity,
     case when v_type in ('มือถือ','ไอแพด') then 'pending_return' else 'not_required' end,
     p_actor_email)
  returning * into v_issue;
  insert into public.it_job_history (job_id, action, details, changed_by_email)
  values (p_job_id, 'inventory_issued', jsonb_build_object('inventory_item_id',p_inventory_item_id,'quantity',p_quantity), p_actor_email);
  return v_issue;
end;
$$;

create or replace function public.complete_it_repair(
  p_inventory_item_id bigint, p_actor_email text
) returns public.it_inventory_items
language plpgsql security invoker set search_path = public
as $$
declare v_item public.it_inventory_items;
begin
  update public.it_inventory_items set status='available', quantity=quantity+1,
    updated_by_email=p_actor_email, updated_at=now()
    where id=p_inventory_item_id and status='repair' returning * into v_item;
  if not found then raise exception 'Repair item not found'; end if;
  return v_item;
end;
$$;

revoke execute on function public.issue_it_inventory(bigint,bigint,integer,text) from public, anon, authenticated;
revoke execute on function public.complete_it_repair(bigint,text) from public, anon, authenticated;
grant execute on function public.issue_it_inventory(bigint,bigint,integer,text) to service_role;
grant execute on function public.complete_it_repair(bigint,text) to service_role;

comment on table public.it_jobs is 'Card 07: IT service desk tickets';
comment on table public.it_inventory_items is 'Card 07: IT inventory by branch and serial number';
comment on table public.it_job_inventory_issues is 'Card 07: stock issued to tickets and old-device return state';
comment on table public.it_job_history is 'Card 07: immutable ticket audit history';
