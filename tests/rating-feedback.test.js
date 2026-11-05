const assert = require('node:assert/strict');
const test = require('node:test');
const dataset = require('../api/_rating-feedback-data.json');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
const handler = require('../api/rating-feedback');

const approver = 'sittichok.s@kumtsu.com';
const assignment = dataset.areaManagers.find((item) => item.branch !== '*' && item.active !== false);
const manager = assignment.email;
const review = dataset.records.find((item) => item.branch === assignment.branch);
const managerBranches = new Set(dataset.areaManagers.filter((item) => item.email === manager).map((item) => item.branch));
const outsideReview = dataset.records.find((item) => !managerBranches.has(item.branch));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const evidence = {
  id: 'evidence-1', path: review.id + '/evidence-1.png', name: 'แก้ไขแล้ว.png', mimeType: 'image/png',
  size: 67, uploadedAt: '2026-11-05T04:00:00Z', uploadedBy: manager,
};
const baseRow = {
  review_id: review.id, status: 'needs_improvement', revision: 3, action_plan: '', action_result: '',
  evidence: [], updated_at: '2026-11-05T03:00:00Z', updated_by_email: approver,
};

function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
}
async function invoke(method = 'GET', body, query = {}, authorization = 'Bearer valid-token') {
  const res = response();
  await handler({ method, headers: { authorization }, body, query }, res);
  return res;
}
function fixture(t, options = {}) {
  const calls = [];
  let row = options.current === null ? null : { ...baseRow, ...options.current };
  t.mock.method(console, 'error', () => {});
  t.mock.method(global, 'fetch', async (url, init = {}) => {
    const stringUrl = String(url);
    calls.push({ url: stringUrl, ...init });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
    if (stringUrl.endsWith('/auth/v1/user')) return json({ id: 'user-1', email: options.actor || manager });
    if (stringUrl.includes('/rest/v1/internal_profiles?')) return json([{
      employee_id: 'KM001', first_name: 'ผู้ดูแล', last_name: 'ทดสอบ', email: options.profileEmail || options.actor || manager,
      status: options.profileStatus || 'active',
    }]);
    if (stringUrl.includes('/rest/v1/rfd_feedback_workflow_history?')) return json(options.history || []);
    if (stringUrl.includes('/rest/v1/rfd_feedback_workflow?')) return options.loadError ? json({ message: 'load failed' }, 500) : json(row ? [row] : []);
    if (stringUrl.includes('/rest/v1/rfd_reviews?')) return json({}, options.syncError ? 500 : 201);
    if (stringUrl.includes('/rest/v1/rpc/rfd_apply_feedback_action')) {
      if (options.rpcError) return json(options.rpcError, 400);
      const data = JSON.parse(init.body);
      const statusByAction = { save_progress: 'in_progress', submit: 'pending_approval', approve: 'resolved', return: 'in_progress', add_evidence: row?.status };
      row = {
        ...(row || baseRow), review_id: data.p_review_id, revision: data.p_expected_revision + 1,
        status: data.p_action === 'set_status' ? data.p_status : statusByAction[data.p_action],
        action_plan: data.p_plan ?? row?.action_plan ?? '', action_result: data.p_result ?? row?.action_result ?? '',
        updated_by_email: data.p_actor_email,
        evidence: data.p_action === 'add_evidence' ? [...(row?.evidence || []), data.p_evidence] : row?.evidence || [],
      };
      return json(options.rpcArray ? [row] : row);
    }
    if (stringUrl.includes('/storage/v1/object/sign/')) {
      return json({ signedURL: options.signedUrl || '/object/sign/rfd-feedback-evidence/' + encodeURIComponent(review.id) + '/evidence-1.png?token=temporary' });
    }
    if (stringUrl.includes('/storage/v1/object/rfd-feedback-evidence/')) return json({}, options.uploadError ? 500 : 200);
    throw new Error('Unexpected test request: ' + stringUrl);
  });
  return {
    calls,
    writes: () => calls.filter((entry) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(entry.method)),
    rpcs: () => calls.filter((entry) => entry.url.includes('/rpc/')).map((entry) => JSON.parse(entry.body)),
    uploads: () => calls.filter((entry) => entry.url.includes('/storage/v1/object/rfd-feedback-evidence/')),
  };
}
const mutation = (overrides = {}) => ({ reviewId: review.id, expectedRevision: 3, ...overrides });
const upload = (overrides = {}) => mutation({ action: 'upload_evidence', fileName: 'หลักฐาน.png', mimeType: 'image/png', data: png, ...overrides });

test('requires a verified session before loading internal data', async () => {
  const result = await invoke('GET', undefined, {}, '');
  assert.equal(result.statusCode, 401);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
});
test('rejects unsupported methods', async () => {
  assert.equal((await invoke('DELETE')).statusCode, 405);
});
test('returns shared actions to active readers without exposing private storage paths', async (t) => {
  fixture(t, { actor: 'reader@kumtsu.com', current: { action_plan: 'จะปรับขั้นตอน', evidence: [evidence] } });
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.records.length, 585);
  assert.equal(result.body.permissions.canApprove, false);
  assert.equal(result.body.issues[review.id].actionPlan, 'จะปรับขั้นตอน');
  assert.equal(result.body.issues[review.id].evidence[0].name, evidence.name);
  assert.equal('path' in result.body.issues[review.id].evidence[0], false);
  for (const email of ['pachara.r@kumtsu.com', 'krissana.s@kumtsu.com']) {
    assert.ok(result.body.areaManagers.some((entry) => entry.email === email && entry.branch === '*'));
  }
});
test('only the verified Sittichok identity receives approval permissions', async (t) => {
  fixture(t, { actor: approver.toUpperCase() });
  assert.equal((await invoke()).body.permissions.canApprove, true);
});
test('inactive profiles cannot read shared data, histories or evidence', async (t) => {
  const f = fixture(t, { profileStatus: 'pending' });
  for (const query of [{}, { reviewId: review.id, history: '1' }, { reviewId: review.id, imageId: evidence.id }]) {
    assert.equal((await invoke('GET', undefined, query)).statusCode, 403);
  }
  assert.equal(f.writes().length, 0);
});
test('ordinary readers and managers of other branches cannot mutate a review', async (t) => {
  const f = fixture(t, { actor: 'reader@kumtsu.com' });
  assert.equal((await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ไข' }))).statusCode, 403);
  assert.equal(f.writes().length, 0);
});
test('a manager cannot write a branch outside their assignments', async (t) => {
  const f = fixture(t);
  assert.equal((await invoke('PUT', mutation({ reviewId: outsideReview.id, action: 'save_progress', plan: 'แก้ไข' }))).statusCode, 403);
  assert.equal(f.writes().length, 0);
});
test('forged actor/profile emails cannot grant approval rights', async (t) => {
  const f = fixture(t, { actor: manager, profileEmail: approver, current: { status: 'pending_approval' } });
  assert.equal((await invoke('PUT', mutation({ action: 'approve', email: approver, actor: approver, p_actor_email: approver }))).statusCode, 403);
  assert.equal(f.rpcs().length, 0);
});
test('all direct resolved or pending_approval status writes are rejected, including an approver', async (t) => {
  const f = fixture(t, { actor: approver });
  for (const status of ['resolved', 'pending_approval']) {
    assert.equal((await invoke('PUT', mutation({ action: 'set_status', status }))).statusCode, 403);
  }
  assert.equal(f.writes().length, 0);
});
test('operations managers may record progress but may not approve it', async (t) => {
  const f = fixture(t, { actor: 'pachara.r@kumtsu.com' });
  assert.equal((await invoke('PUT', mutation({ action: 'save_progress', plan: 'ปรับวิธีหุงข้าว' }))).statusCode, 200);
  assert.equal(f.rpcs()[0].p_actor_email, 'pachara.r@kumtsu.com');
  assert.equal((await invoke('PUT', mutation({ action: 'approve', expectedRevision: 4 }))).statusCode, 403);
});
test('saving a plan stays in progress and sends only server-authorized RPC fields', async (t) => {
  const f = fixture(t, { actor: manager.toUpperCase(), rpcArray: true });
  const result = await invoke('PUT', mutation({ action: 'save_progress', plan: '  ปรับขั้นตอนเตรียมของ  ', result: '', approvedBy: approver }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue.status, 'in_progress');
  assert.equal(result.body.issue.revision, 4);
  assert.deepEqual(f.rpcs()[0], {
    p_review_id: review.id, p_actor_email: manager, p_expected_revision: 3, p_action: 'save_progress',
    p_status: null, p_plan: 'ปรับขั้นตอนเตรียมของ', p_result: '', p_reason: null, p_evidence: null,
  });
});
test('missing or stale revisions are rejected before any write', async (t) => {
  const f = fixture(t);
  for (const [expectedRevision, status] of [[undefined, 400], [2, 409], [-1, 400], ['3', 400]]) {
    assert.equal((await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ไข', expectedRevision }))).statusCode, status);
  }
  assert.equal(f.writes().length, 0);
});
test('a concurrent change inside the transactional RPC returns conflict without a false saved issue', async (t) => {
  fixture(t, { rpcError: { code: 'P0001', message: 'conflict: stale revision' } });
  const result = await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ไข' }));
  assert.equal(result.statusCode, 409);
  assert.equal(result.body.issue, undefined);
});
test('database permission and validation failures retain their response category', async (t) => {
  for (const [message, status] of [['forbidden: inactive actor', 403], ['invalid: missing outcome', 400]]) {
    fixture(t, { rpcError: { message } });
    assert.equal((await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ไข' }))).statusCode, status);
    t.mock.restoreAll();
  }
});
test('invalid or oversized descriptions are rejected without mutation', async (t) => {
  const f = fixture(t);
  for (const fields of [{ plan: '', result: '' }, { plan: 'x'.repeat(4001) }, { plan: {} }]) {
    assert.equal((await invoke('PUT', mutation({ action: 'save_progress', ...fields }))).statusCode, 400);
  }
  assert.equal(f.writes().length, 0);
});
test('sending for approval requires a result and existing image evidence', async (t) => {
  const f = fixture(t, { current: { action_result: 'ดำเนินการแล้ว' } });
  assert.equal((await invoke('PUT', mutation({ action: 'submit' }))).statusCode, 400);
  assert.equal(f.writes().length, 0);
});
test('image evidence alone without a result cannot be submitted', async (t) => {
  const f = fixture(t, { current: { evidence: [evidence] } });
  assert.equal((await invoke('PUT', mutation({ action: 'submit' }))).statusCode, 400);
  assert.equal(f.writes().length, 0);
});
test('a complete result is sent for approval rather than resolved', async (t) => {
  const f = fixture(t, { current: { evidence: [evidence] } });
  const result = await invoke('PUT', mutation({ action: 'submit', result: 'ปรับเวลาหุงและตรวจความสุกทุกหม้อแล้ว' }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue.status, 'pending_approval');
  assert.equal(f.rpcs()[0].p_action, 'submit');
});
test('pending submissions lock editing, cancellation and new uploads', async (t) => {
  const f = fixture(t, { actor: approver, current: { status: 'pending_approval' } });
  assert.equal((await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ไข' }))).statusCode, 409);
  assert.equal((await invoke('PUT', mutation({ action: 'set_status', status: 'none' }))).statusCode, 409);
  assert.equal((await invoke('POST', upload())).statusCode, 409);
  assert.equal(f.writes().length, 0);
});
test('Sittichok can approve only a submitted action', async (t) => {
  const f = fixture(t, { actor: approver, current: { status: 'pending_approval', action_result: 'แก้แล้ว', evidence: [evidence] } });
  const result = await invoke('PUT', mutation({ action: 'approve' }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue.status, 'resolved');
  assert.equal(f.rpcs()[0].p_actor_email, approver);
});
test('approval cannot skip the submission stage', async (t) => {
  const f = fixture(t, { actor: approver });
  assert.equal((await invoke('PUT', mutation({ action: 'approve' }))).statusCode, 409);
  assert.equal(f.writes().length, 0);
});
test('returning an action requires an explanation and remains in progress', async (t) => {
  const f = fixture(t, { actor: approver, current: { status: 'pending_approval' } });
  assert.equal((await invoke('PUT', mutation({ action: 'return', reason: '' }))).statusCode, 400);
  const result = await invoke('PUT', mutation({ action: 'return', reason: '  ขอภาพขั้นตอนทวนสอบด้วย  ' }));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.issue.status, 'in_progress');
  assert.equal(f.rpcs()[0].p_reason, 'ขอภาพขั้นตอนทวนสอบด้วย');
});
test('completed actions cannot be edited or reopened by branch managers', async (t) => {
  const f = fixture(t, { current: { status: 'resolved' } });
  assert.equal((await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ใหม่' }))).statusCode, 409);
  assert.equal((await invoke('PUT', mutation({ action: 'set_status', status: 'needs_improvement' }))).statusCode, 409);
  assert.equal(f.writes().length, 0);
});
test('only Sittichok can reopen a completed action as needs improvement', async (t) => {
  fixture(t, { actor: approver, current: { status: 'resolved' } });
  assert.equal((await invoke('PUT', mutation({ action: 'set_status', status: 'needs_improvement' }))).statusCode, 200);
});
test('cancellation is approver-only and preserves the workflow instead of deleting history', async (t) => {
  const f = fixture(t);
  assert.equal((await invoke('PUT', mutation({ action: 'set_status', status: 'none' }))).statusCode, 403);
  assert.equal(f.writes().length, 0);
});
test('Sittichok cancellation uses the audited action RPC with no DELETE request', async (t) => {
  const f = fixture(t, { actor: approver });
  assert.equal((await invoke('PUT', mutation({ action: 'set_status', status: 'none' }))).statusCode, 200);
  assert.equal(f.rpcs()[0].p_status, 'none');
  assert.equal(f.calls.some((entry) => entry.method === 'DELETE'), false);
});
test('creating workflow synchronizes the review before a single action transaction', async (t) => {
  const f = fixture(t, { current: null });
  const result = await invoke('PUT', mutation({ action: 'set_status', status: 'needs_improvement', expectedRevision: 0 }));
  assert.equal(result.statusCode, 200);
  const writes = f.writes();
  assert.match(writes[0].url, /rfd_reviews\?/);
  assert.match(writes[1].url, /rpc\/rfd_apply_feedback_action/);
});
test('nonimage, disguised SVG, malformed base64 and oversized uploads fail before writing storage', async (t) => {
  const f = fixture(t);
  for (const changes of [
    { mimeType: 'image/svg+xml', data: Buffer.from('<svg/>').toString('base64') },
    { mimeType: 'image/png', data: Buffer.from('<svg/>').toString('base64') },
    { data: 'not valid base64' },
    { data: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') },
  ]) assert.equal((await invoke('POST', upload(changes))).statusCode, 400);
  assert.equal(f.writes().length, 0);
});
test('maximum five evidence images is enforced before another upload', async (t) => {
  const f = fixture(t, { current: { evidence: Array.from({ length: 5 }, (_, i) => ({ ...evidence, id: String(i) })) } });
  assert.equal((await invoke('POST', upload())).statusCode, 400);
  assert.equal(f.uploads().length, 0);
});
test('valid uploads use private immutable objects and trusted evidence metadata', async (t) => {
  const f = fixture(t);
  const result = await invoke('POST', upload({ fileName: '../ปลายทาง.png', path: 'forged', uploadedBy: approver }));
  assert.equal(result.statusCode, 200);
  assert.equal(f.uploads().length, 1);
  assert.equal(f.uploads()[0].headers['x-upsert'], 'false');
  assert.equal(f.uploads()[0].headers['Content-Type'], 'image/png');
  assert.ok(Buffer.isBuffer(f.uploads()[0].body));
  const rpc = f.rpcs()[0];
  assert.equal(rpc.p_action, 'add_evidence');
  assert.equal(rpc.p_evidence.uploadedBy, manager);
  assert.match(rpc.p_evidence.path, new RegExp('^' + review.id.replace(/[.*+?^$()|[\]\\]/g, '\\$&') + '/[a-f0-9-]{36}\\.png$'));
  assert.equal(rpc.p_evidence.name.includes('/'), false);
  assert.equal('path' in result.body.issue.evidence[0], false);
});
test('failed storage upload does not record evidence as saved', async (t) => {
  const f = fixture(t, { uploadError: true });
  const result = await invoke('POST', upload());
  assert.equal(result.statusCode, 503);
  assert.equal(f.rpcs().length, 0);
  assert.equal(result.body.issue, undefined);
});
test('an upload racing with another revision returns conflict without exposing unlinked evidence', async (t) => {
  const f = fixture(t, { rpcError: { message: 'conflict: changed after upload' } });
  const result = await invoke('POST', upload());
  assert.equal(result.statusCode, 409);
  assert.equal(f.uploads().length, 1);
  assert.equal(result.body.issue, undefined);
});
test('active readers can view action histories, including legacy plain text notes', async (t) => {
  fixture(t, { actor: 'reader@kumtsu.com', history: [
    { from_status: 'needs_improvement', to_status: 'in_progress', note: 'ข้อความเดิม', changed_by_email: manager, changed_at: '2026-11-05T04:00:00Z' },
    { from_status: 'in_progress', to_status: 'pending_approval', note: JSON.stringify({ action: 'submit', action_result: 'แก้แล้ว' }), changed_by_email: manager, changed_at: '2026-11-05T04:01:00Z' },
  ] });
  const result = await invoke('GET', undefined, { reviewId: review.id, history: '1' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.history[0].note, 'ข้อความเดิม');
  assert.equal(result.body.history[1].note.action, 'submit');
  assert.equal(result.body.history[0].changedBy, manager);
});
test('active readers get time-limited URLs only for evidence linked to that review', async (t) => {
  const f = fixture(t, { actor: 'reader@kumtsu.com', current: { evidence: [evidence] } });
  const result = await invoke('GET', undefined, { reviewId: review.id, imageId: evidence.id });
  assert.equal(result.statusCode, 200);
  assert.ok(result.body.url.startsWith('https://example.supabase.co/storage/v1/object/sign/rfd-feedback-evidence/'));
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  const signedRequest = f.calls.find((entry) => entry.url.includes('/object/sign/'));
  assert.deepEqual(JSON.parse(signedRequest.body), { expiresIn: 60 });
});
for (const [description, signedUrl] of [
  ['storage relative', '/object/sign/rfd-feedback-evidence/file.png?token=x'],
  ['root relative', '/storage/v1/object/sign/rfd-feedback-evidence/file.png?token=x'],
  ['absolute', 'https://example.supabase.co/storage/v1/object/sign/rfd-feedback-evidence/file.png?token=x'],
]) {
  test('normalizes ' + description + ' storage signed URLs correctly', async (t) => {
    fixture(t, { current: { evidence: [evidence] }, signedUrl });
    const result = await invoke('GET', undefined, { reviewId: review.id, imageId: evidence.id });
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.url, 'https://example.supabase.co/storage/v1/object/sign/rfd-feedback-evidence/file.png?token=x');
  });
}
test('refuses storage responses pointing at an external host', async (t) => {
  fixture(t, { current: { evidence: [evidence] }, signedUrl: 'https://attacker.invalid/storage/v1/object/sign/rfd-feedback-evidence/file.png' });
  assert.equal((await invoke('GET', undefined, { reviewId: review.id, imageId: evidence.id })).statusCode, 503);
});
test('unknown reviews or unlinked image IDs never request a signed URL', async (t) => {
  const f = fixture(t, { current: { evidence: [evidence] } });
  assert.equal((await invoke('GET', undefined, { reviewId: 'unknown', imageId: evidence.id })).statusCode, 404);
  assert.equal((await invoke('GET', undefined, { reviewId: review.id, imageId: 'other-image' })).statusCode, 404);
  assert.equal(f.calls.some((entry) => entry.url.includes('/object/sign/')), false);
});
test('workflow load errors do not turn into empty shared statuses', async (t) => {
  fixture(t, { loadError: true });
  assert.equal((await invoke()).statusCode, 503);
});
test('database write failures do not return a successful action', async (t) => {
  fixture(t, { rpcError: { message: 'database unavailable' } });
  const result = await invoke('PUT', mutation({ action: 'save_progress', plan: 'แก้ไข' }));
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.issue, undefined);
});
