-- Pending owner approval: do not apply automatically.
-- Adds branch action reports, private evidence, revision checks and Sittichok approval.
-- No existing review, workflow or history rows are deleted.
begin;

alter table public.rfd_feedback_workflow
  add column if not exists action_plan text not null default '',
  add column if not exists action_result text not null default '',
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists revision integer not null default 0,
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by_email text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_email text,
  add column if not exists return_reason text not null default '';

alter table public.rfd_feedback_workflow
  drop constraint rfd_feedback_workflow_status_check,
  add constraint rfd_feedback_workflow_status_check
    check (status in ('none','needs_improvement','in_progress','pending_approval','resolved'));
alter table public.rfd_feedback_workflow_history
  drop constraint rfd_feedback_workflow_history_to_status_check,
  add constraint rfd_feedback_workflow_history_to_status_check
    check (to_status in ('none','needs_improvement','in_progress','pending_approval','resolved'));

-- Server-only writes prevent bypassing approval by calling the Data API directly.
-- Existing SELECT policies are retained; the API separately requires an active profile.
revoke insert, update, delete on public.rfd_feedback_workflow from anon, authenticated;
revoke insert, update, delete on public.rfd_feedback_workflow_history from anon, authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('rfd-feedback-evidence','rfd-feedback-evidence',false,2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- SECURITY INVOKER: called only by the authenticated server with its service role.
-- The API obtains p_actor_email from a verified Auth user, never from request JSON.
create or replace function public.rfd_apply_feedback_action(
  p_review_id text,
  p_actor_email text,
  p_expected_revision integer,
  p_action text,
  p_status text default null,
  p_plan text default null,
  p_result text default null,
  p_reason text default null,
  p_evidence jsonb default null
) returns public.rfd_feedback_workflow
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row public.rfd_feedback_workflow%rowtype;
  v_branch text;
  v_actor text := lower(btrim(coalesce(p_actor_email,'')));
  v_approver boolean := lower(btrim(coalesce(p_actor_email,''))) = 'sittichok.s@kumtsu.com';
  v_previous text;
  v_now timestamptz;
  v_public_evidence jsonb;
  v_created boolean := false;
begin
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid: กรุณาระบุเลขรุ่นข้อมูลล่าสุด';
  end if;
  if p_action is null or p_action not in
      ('set_status','save_progress','submit','approve','return','add_evidence') then
    raise exception 'invalid: คำสั่งไม่ถูกต้อง';
  end if;
  if not exists (select 1 from public.internal_profiles
      where lower(email) = v_actor and status = 'active') then
    raise exception 'forbidden: บัญชีนี้ไม่ได้รับอนุมัติให้ใช้งาน';
  end if;
  select branch into v_branch from public.rfd_reviews where review_id = p_review_id;
  if not found then raise exception 'invalid: ไม่พบรีวิว'; end if;
  if not v_approver and v_actor not in ('pachara.r@kumtsu.com','krissana.s@kumtsu.com')
     and not exists (select 1 from public.rfd_area_manager_assignments a
       where a.active and lower(a.manager_email) = v_actor
         and (a.branch = '*' or a.branch = v_branch or a.role = 'operations_manager')) then
    raise exception 'forbidden: คุณไม่มีสิทธิ์แก้ไขสาขานี้';
  end if;
  if char_length(coalesce(p_plan,'')) > 4000 or char_length(coalesce(p_result,'')) > 4000
     or char_length(coalesce(p_reason,'')) > 2000 then
    raise exception 'invalid: ข้อความยาวเกินกำหนด';
  end if;

  select * into v_row from public.rfd_feedback_workflow
    where review_id = p_review_id for update;
  if not found then
    if p_action <> 'set_status' or p_status is null
       or p_status not in ('needs_improvement','in_progress','none') then
      raise exception 'invalid: ต้องเปิดติดตามรายการก่อน';
    end if;
    -- ON CONFLICT also serializes simultaneous attempts to create the first row.
    insert into public.rfd_feedback_workflow
      (review_id,status,updated_by_email,revision)
    values (p_review_id,p_status,v_actor,0) on conflict (review_id) do nothing;
    select * into v_row from public.rfd_feedback_workflow
      where review_id = p_review_id for update;
    v_created := true;
  end if;
  if v_row.revision <> p_expected_revision then
    raise exception 'conflict: รายการถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนส่งอีกครั้ง';
  end if;
  v_previous := case when v_created then null else v_row.status end;
  v_now := clock_timestamp();

  if p_action = 'set_status' then
    if p_status is null or p_status not in ('none','needs_improvement','in_progress') then
      raise exception 'invalid: ต้องส่งตรวจและให้คุณสิทธิโชคอนุมัติก่อนปิดงาน';
    end if;
    if v_row.status = 'pending_approval' then
      raise exception 'conflict: รอคุณสิทธิโชคอนุมัติหรือส่งกลับแก้ไข';
    end if;
    if p_status = 'none' and not v_approver then
      raise exception 'forbidden: เฉพาะคุณสิทธิโชคยกเลิกการติดตามได้';
    end if;
    if v_row.status = 'resolved' and (not v_approver or p_status <> 'needs_improvement') then
      raise exception 'forbidden: เฉพาะคุณสิทธิโชคเปิดงานที่ปิดแล้วขึ้นใหม่ได้';
    end if;
    v_row.status := p_status;
    if v_previous = 'resolved' then
      v_row.approved_at := null;
      v_row.approved_by_email := null;
    end if;
  elsif p_action in ('save_progress','submit','add_evidence') then
    if v_row.status not in ('needs_improvement','in_progress') then
      raise exception 'conflict: รายการนี้ยังไม่เปิดให้แก้ไข กรุณาตรวจสถานะล่าสุด';
    end if;
    if p_action in ('save_progress','submit') then
      v_row.action_plan := btrim(coalesce(p_plan,v_row.action_plan));
      v_row.action_result := btrim(coalesce(p_result,v_row.action_result));
      if v_row.action_plan = '' and v_row.action_result = '' then
        raise exception 'invalid: กรุณาระบุแผนหรือผลดำเนินการ';
      end if;
      v_row.status := 'in_progress';
      if p_action = 'submit' then
        if v_row.action_result = '' or jsonb_array_length(v_row.evidence) = 0 then
          raise exception 'invalid: กรุณาระบุผลดำเนินการและแนบรูปหลักฐานก่อนส่งตรวจ';
        end if;
        v_row.status := 'pending_approval';
        v_row.submitted_at := v_now;
        v_row.submitted_by_email := v_actor;
        v_row.approved_at := null;
        v_row.approved_by_email := null;
        v_row.return_reason := '';
      end if;
    else
      if jsonb_array_length(v_row.evidence) >= 5 then
        raise exception 'invalid: แนบรูปได้สูงสุด 5 รูปต่อรายการ';
      end if;
      if p_evidence is null or jsonb_typeof(p_evidence) <> 'object' then
        raise exception 'invalid: ข้อมูลรูปไม่ถูกต้อง';
      end if;
      if coalesce(p_evidence->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or coalesce(p_evidence->>'mimeType','') not in ('image/jpeg','image/png','image/webp')
         or coalesce(p_evidence->>'size','') !~ '^[0-9]{1,7}$'
         or char_length(coalesce(p_evidence->>'name','')) not between 1 and 200 then
        raise exception 'invalid: ข้อมูลรูปไม่ถูกต้อง';
      end if;
      if (p_evidence->>'size')::integer not between 1 and 2097152
         or split_part(p_evidence->>'path','/',1) is distinct from p_review_id
         or (p_evidence->>'path') is distinct from
           (p_review_id || '/' || (p_evidence->>'id') || case p_evidence->>'mimeType'
             when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end)
         or (p_evidence->>'uploadedBy') is distinct from v_actor then
        raise exception 'invalid: ข้อมูลรูปไม่ถูกต้อง';
      end if;
      v_row.evidence := v_row.evidence || jsonb_build_array(p_evidence);
    end if;
  elsif p_action in ('approve','return') then
    if not v_approver then raise exception 'forbidden: เฉพาะคุณสิทธิโชคอนุมัติหรือส่งกลับได้'; end if;
    if v_row.status <> 'pending_approval' then raise exception 'conflict: รายการนี้ยังไม่ได้ส่งตรวจ'; end if;
    if p_action = 'approve' then
      if v_row.action_result = '' or jsonb_array_length(v_row.evidence) = 0 then
        raise exception 'invalid: รายการนี้ยังไม่มีผลดำเนินการหรือหลักฐาน';
      end if;
      v_row.status := 'resolved';
      v_row.approved_at := v_now;
      v_row.approved_by_email := v_actor;
    else
      if btrim(coalesce(p_reason,'')) = '' then raise exception 'invalid: กรุณาระบุเหตุผลที่ส่งกลับ'; end if;
      v_row.status := 'in_progress';
      v_row.return_reason := btrim(p_reason);
    end if;
  end if;

  update public.rfd_feedback_workflow set
    status = v_row.status, action_plan = v_row.action_plan, action_result = v_row.action_result,
    evidence = v_row.evidence, revision = v_row.revision + 1,
    submitted_at = v_row.submitted_at, submitted_by_email = v_row.submitted_by_email,
    approved_at = v_row.approved_at, approved_by_email = v_row.approved_by_email,
    return_reason = v_row.return_reason, updated_at = v_now, updated_by_email = v_actor
    where review_id = p_review_id returning * into v_row;

  select coalesce(jsonb_agg(e - 'path'),'[]'::jsonb) into v_public_evidence
    from jsonb_array_elements(v_row.evidence) e;
  insert into public.rfd_feedback_workflow_history
    (review_id,from_status,to_status,note,changed_at,changed_by_email)
  values (p_review_id,v_previous,v_row.status,
    jsonb_build_object('action',p_action,'plan',v_row.action_plan,'result',v_row.action_result,
      'evidence',v_public_evidence,'returnReason',v_row.return_reason,'revision',v_row.revision,
      'submittedAt',v_row.submitted_at,'submittedBy',v_row.submitted_by_email,
      'approvedAt',v_row.approved_at,'approvedBy',v_row.approved_by_email)::text,
    v_now,v_actor);
  return v_row;
end;
$$;

revoke all on function public.rfd_apply_feedback_action(text,text,integer,text,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.rfd_apply_feedback_action(text,text,integer,text,text,text,text,text,jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
