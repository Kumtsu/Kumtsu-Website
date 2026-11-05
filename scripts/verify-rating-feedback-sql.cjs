// Local-only verification. Pass the path to a separately installed @electric-sql/pglite.
// This script never reads credentials or connects to a production database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  const completed = [];
  async function check(name, fn) { await fn(); completed.push(name); }
  const manager = 'branch-manager@example.test';
  const approver = 'sittichok.s@kumtsu.com';
  async function action(actor, revision, name, fields = {}, review = 'review-a') {
    const { rows } = await db.query(`select * from public.rfd_apply_feedback_action($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [review, actor, revision, name, fields.status ?? null, fields.plan ?? null,
        fields.result ?? null, fields.reason ?? null, fields.evidence ? JSON.stringify(fields.evidence) : null]);
    return rows[0];
  }
  async function row() { return (await db.query("select * from public.rfd_feedback_workflow where review_id='review-a'")).rows[0]; }
  const image = { id: '11111111-1111-4111-8111-111111111111', name: 'evidence.jpg',
    path: 'review-a/11111111-1111-4111-8111-111111111111.jpg', mimeType: 'image/jpeg',
    size: 300, uploadedAt: '2026-11-05T06:00:00Z', uploadedBy: manager };
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.internal_profiles(email text primary key,status text);
      create table public.rfd_reviews(review_id text primary key,branch text);
      create table public.rfd_area_manager_assignments(branch text,manager_email text,role text,active boolean);
      create table public.rfd_feedback_workflow(
        review_id text primary key references public.rfd_reviews(review_id) on delete cascade,
        status text not null constraint rfd_feedback_workflow_status_check check(status in ('needs_improvement','in_progress','resolved')),
        category text,severity text,note text,updated_at timestamptz default now(),updated_by_email text not null);
      create table public.rfd_feedback_workflow_history(
        id bigint generated always as identity primary key,
        review_id text references public.rfd_reviews(review_id) on delete cascade,
        from_status text,to_status text not null constraint rfd_feedback_workflow_history_to_status_check
          check(to_status in ('needs_improvement','in_progress','resolved')),
        note text,changed_at timestamptz,changed_by_email text);
      grant usage on schema public to anon,authenticated,service_role;
      grant all on all tables in schema public to anon,authenticated,service_role;
      grant usage on all sequences in schema public to service_role;
      insert into public.internal_profiles values
        ('branch-manager@example.test','active'),('other-manager@example.test','active'),
        ('viewer@example.test','active'),('inactive@example.test','pending'),
        ('sittichok.s@kumtsu.com','active'),('pachara.r@kumtsu.com','active'),('krissana.s@kumtsu.com','active');
      insert into public.rfd_reviews values ('review-a','A'),('review-b','B');
      insert into public.rfd_area_manager_assignments values
        ('A','branch-manager@example.test','area_manager',true),('B','other-manager@example.test','area_manager',true);
      -- A pre-existing misconfigured bucket must become private when the setup is approved.
      insert into storage.buckets values ('rfd-feedback-evidence','rfd-feedback-evidence',true,null,null);
    `);
    await check('migration executes on PostgreSQL', async () => {
      await db.exec(fs.readFileSync(path.join(__dirname,'../database/rating-feedback-actions.pending.sql'),'utf8'));
    });
    await check('existing evidence bucket becomes private with size and MIME limits', async () => {
      const bucket = (await db.query("select * from storage.buckets where id='rfd-feedback-evidence'")).rows[0];
      assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),2097152);
      assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
    });
    await check('viewer cannot start workflow', () => assert.rejects(action('viewer@example.test',0,'set_status',{status:'needs_improvement'}), /forbidden:/));
    await check('inactive profile cannot write', () => assert.rejects(action('inactive@example.test',0,'set_status',{status:'needs_improvement'}), /forbidden:/));
    await check('manager cannot change another branch', () => assert.rejects(action('other-manager@example.test',0,'set_status',{status:'needs_improvement'}), /forbidden:/));
    await check('start tracking records a null prior state', async () => {
      const saved=await action(manager,0,'set_status',{status:'needs_improvement'});
      assert.equal(saved.revision,1);
      const history=(await db.query('select from_status from public.rfd_feedback_workflow_history order by id')).rows;
      assert.equal(history[0].from_status,null);
    });
    await check('plan alone is in progress, not submitted or completed', async () => {
      const saved=await action(manager,1,'save_progress',{plan:'ฝึกทีมและเพิ่มรายการตรวจสอบ'});
      assert.equal(saved.status,'in_progress'); assert.equal(saved.submitted_at,null); assert.equal(saved.action_result,'');
    });
    await check('submit without result and evidence is rejected atomically', async () => {
      await assert.rejects(action(manager,2,'submit'), /invalid:/);
      assert.equal((await row()).revision,2);
      assert.equal((await db.query('select count(*)::int n from public.rfd_feedback_workflow_history')).rows[0].n,2);
    });
    await check('bad image metadata cannot be attached', async () => {
      await assert.rejects(action(manager,2,'add_evidence',{evidence:{...image,path:'review-b/foreign.jpg'}}), /invalid:/);
      await assert.rejects(action(manager,2,'add_evidence',{evidence:{...image,size:2097153}}), /invalid:/);
      await assert.rejects(action(manager,2,'add_evidence',{evidence:{...image,uploadedBy:approver}}), /invalid:/);
    });
    await check('image metadata is persisted in shared workflow', async () => {
      const saved=await action(manager,2,'add_evidence',{evidence:image});
      assert.equal(saved.revision,3); assert.equal(saved.evidence[0].id,image.id);
    });
    await check('submission is pending approval', async () => {
      const saved=await action(manager,3,'submit',{result:'อบรมทีมและทดสอบรายการตรวจสอบแล้ว'});
      assert.equal(saved.status,'pending_approval'); assert.equal(saved.submitted_by_email,manager); assert.equal(saved.approved_at,null);
    });
    await check('branch manager and Operations Manager cannot approve', async () => {
      await assert.rejects(action(manager,4,'approve'), /forbidden:/);
      await assert.rejects(action('pachara.r@kumtsu.com',4,'approve'), /forbidden:/);
      await assert.rejects(action('krissana.s@kumtsu.com',4,'approve'), /forbidden:/);
    });
    await check('submitted snapshot cannot be edited or cancelled', async () => {
      await assert.rejects(action(manager,4,'save_progress',{result:'changed'}), /conflict:/);
      await assert.rejects(action(manager,4,'set_status',{status:'none'}), /conflict:/);
      await assert.rejects(action(approver,4,'set_status',{status:'in_progress'}), /conflict:/);
      assert.equal((await row()).revision,4);
    });
    await check('return requires a reason and reopens for the branch', async () => {
      await assert.rejects(action(approver,4,'return'), /invalid:/);
      const saved=await action(approver,4,'return',{reason:'เพิ่มหลักฐานการตรวจรอบเย็น'});
      assert.equal(saved.status,'in_progress'); assert.equal(saved.return_reason,'เพิ่มหลักฐานการตรวจรอบเย็น');
    });
    await check('stale revision cannot overwrite a newer update', async () => {
      await assert.rejects(action(manager,4,'save_progress',{result:'stale'}), /conflict:/);
      assert.equal((await row()).revision,5);
    });
    await check('branch can resubmit and only Sittichok completes it', async () => {
      await action(manager,5,'save_progress',{result:'ตรวจรอบเย็นและยืนยันการแก้ไขแล้ว'});
      await action(manager,6,'submit');
      const saved=await action(approver,7,'approve');
      assert.equal(saved.status,'resolved'); assert.equal(saved.approved_by_email,approver); assert.ok(saved.approved_at);
    });
    await check('completed work is read only for branch manager', async () => {
      await assert.rejects(action(manager,8,'save_progress',{result:'changed'}), /conflict:/);
      await assert.rejects(action(manager,8,'set_status',{status:'needs_improvement'}), /forbidden:/);
    });
    await check('direct resolved shortcut is always rejected', () => assert.rejects(action(approver,8,'set_status',{status:'resolved'}), /invalid:/));
    await check('Sittichok may reopen; approval remains in audit history', async () => {
      const saved=await action(approver,8,'set_status',{status:'needs_improvement'});
      assert.equal(saved.approved_at,null); assert.equal(saved.approved_by_email,null);
      const history=(await db.query('select note::jsonb note from public.rfd_feedback_workflow_history order by id')).rows;
      assert.ok(history.some(h=>h.note.approvedBy===approver));
      assert.ok(history.every(h=>h.note.evidence.every(e=>!Object.hasOwn(e,'path'))));
    });
    await check('manager cannot cancel to hide an unfinished item', () => assert.rejects(action(manager,9,'set_status',{status:'none'}), /forbidden:/));
    await check('authenticated users cannot bypass API with direct table writes or RPC', async () => {
      await db.exec('set role authenticated');
      try {
        await assert.rejects(db.query("update public.rfd_feedback_workflow set status='resolved'"), /permission denied/);
        await assert.rejects(db.query("insert into public.rfd_feedback_workflow_history(review_id,to_status) values ('review-a','resolved')"), /permission denied/);
        await assert.rejects(action(approver,9,'approve'), /permission denied/);
        assert.equal((await db.query('select count(*)::int n from public.rfd_feedback_workflow')).rows[0].n,1);
      } finally { await db.exec('reset role'); }
    });
    await check('service role executes invoker function without elevated definer privileges', async () => {
      await db.exec('set role service_role');
      try { assert.equal((await action(manager,9,'save_progress',{plan:'ตรวจซ้ำ'})).revision,10); }
      finally { await db.exec('reset role'); }
    });
    console.log(JSON.stringify({passed:completed.length,checks:completed},null,2));
  } finally { await db.close(); }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
