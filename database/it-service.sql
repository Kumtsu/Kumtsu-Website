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
  asset_number text,
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
  destination_inventory_item_id bigint references public.it_inventory_items(id),
  source_branch text,
  source_storage_location text,
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
create index if not exists it_job_inventory_destination_idx on public.it_job_inventory_issues(destination_inventory_item_id);
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
  v_job public.it_jobs;
  v_item public.it_inventory_items;
  v_destination_id bigint;
  v_issue public.it_job_inventory_issues;
begin
  if p_quantity < 1 then raise exception 'Quantity must be positive'; end if;

  select * into v_job from public.it_jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found'; end if;

  select * into v_item from public.it_inventory_items
    where id = p_inventory_item_id and status = 'available' for update;
  if not found or v_item.quantity < p_quantity then raise exception 'Insufficient inventory'; end if;

  if (coalesce(v_item.serial_number,'') <> '' or coalesce(v_item.asset_number,'') <> '')
     and p_quantity <> v_item.quantity then
    raise exception 'Serialized inventory must be transferred as a whole item';
  end if;

  if v_item.quantity = p_quantity then
    update public.it_inventory_items
      set branch = v_job.branch,
          storage_location = v_job.requester_name,
          updated_by_email = p_actor_email,
          updated_at = now()
      where id = v_item.id
      returning id into v_destination_id;
  else
    update public.it_inventory_items
      set quantity = quantity - p_quantity,
          updated_by_email = p_actor_email,
          updated_at = now()
      where id = v_item.id;

    insert into public.it_inventory_items
      (equipment_type,brand,model,serial_number,asset_number,quantity,minimum_quantity,
       branch,storage_location,status,note,created_by_email,updated_by_email)
    values
      (v_item.equipment_type,v_item.brand,v_item.model,null,null,p_quantity,0,
       v_job.branch,v_job.requester_name,'available',v_item.note,p_actor_email,p_actor_email)
    returning id into v_destination_id;
  end if;

  insert into public.it_job_inventory_issues
    (job_id, inventory_item_id, destination_inventory_item_id, source_branch,
     source_storage_location, quantity, old_device_status, issued_by_email)
  values
    (p_job_id, p_inventory_item_id, v_destination_id, v_item.branch,
     v_item.storage_location, p_quantity,
     case when v_item.equipment_type in ('มือถือ','ไอแพด') then 'pending_return' else 'not_required' end,
     p_actor_email)
  returning * into v_issue;
  insert into public.it_job_history (job_id, action, details, changed_by_email)
  values (p_job_id, 'inventory_transferred', jsonb_build_object(
    'source_inventory_item_id',p_inventory_item_id,
    'destination_inventory_item_id',v_destination_id,
    'quantity',p_quantity,
    'source_branch',v_item.branch,
    'destination_branch',v_job.branch,
    'new_owner',v_job.requester_name
  ), p_actor_email);
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

create or replace function public.delete_it_job(
  p_job_id bigint, p_actor_email text
) returns boolean
language plpgsql security invoker set search_path = public
as $$
declare
  v_exists boolean;
  v_issue public.it_job_inventory_issues;
begin
  select exists(select 1 from public.it_jobs where id = p_job_id) into v_exists;
  if not v_exists then return false; end if;
  for v_issue in
    select * from public.it_job_inventory_issues where job_id = p_job_id order by id for update
  loop
    if v_issue.destination_inventory_item_id = v_issue.inventory_item_id then
      update public.it_inventory_items
        set branch = coalesce(v_issue.source_branch,branch),
            storage_location = coalesce(v_issue.source_storage_location,storage_location),
            updated_by_email = p_actor_email,
            updated_at = now()
        where id = v_issue.inventory_item_id;
    elsif v_issue.destination_inventory_item_id is not null then
      delete from public.it_job_inventory_issues where id = v_issue.id;
      delete from public.it_inventory_items where id = v_issue.destination_inventory_item_id;
      update public.it_inventory_items
        set quantity = quantity + v_issue.quantity,
            updated_by_email = p_actor_email,
            updated_at = now()
        where id = v_issue.inventory_item_id;
    else
      update public.it_inventory_items
        set quantity = quantity + v_issue.quantity,
            updated_by_email = p_actor_email,
            updated_at = now()
        where id = v_issue.inventory_item_id;
    end if;
  end loop;
  delete from public.it_jobs where id = p_job_id;
  return true;
end;
$$;

revoke execute on function public.issue_it_inventory(bigint,bigint,integer,text) from public, anon, authenticated;
revoke execute on function public.complete_it_repair(bigint,text) from public, anon, authenticated;
revoke execute on function public.delete_it_job(bigint,text) from public, anon, authenticated;
grant execute on function public.issue_it_inventory(bigint,bigint,integer,text) to service_role;
grant execute on function public.complete_it_repair(bigint,text) to service_role;
grant execute on function public.delete_it_job(bigint,text) to service_role;

comment on table public.it_jobs is 'Card 07: IT service desk tickets';
comment on table public.it_inventory_items is 'Card 07: IT inventory by branch and serial number';
comment on table public.it_job_inventory_issues is 'Card 07: stock issued to tickets and old-device return state';
comment on table public.it_job_history is 'Card 07: immutable ticket audit history';
