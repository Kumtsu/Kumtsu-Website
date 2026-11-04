const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dashboardData = require('../api/_rating-feedback-data.json');
const MAINTENANCE_ADMINS = ['uthumporn.p@kumtsu.com', 'pachara.r@kumtsu.com', 'krissana.s@kumtsu.com'];
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');

function response() { return { setHeader() {} }; }
function ok(data = []) { return { response: { ok: true }, data }; }

function harness(route, {
  email = 'krissana.s@kumtsu.com',
  loggedIn = true,
  active = true,
  technicianKey = null,
  assignedTo = ['นอส'],
  attachmentsPresent = true,
} = {}) {
  const requests = [];
  const writes = [];
  const job = { id: 1, status: 'waiting', assigned_to: assignedTo };
  const profile = { user_id: 'verified-test-user', email, first_name: 'Test', last_name: 'User', status: active ? 'active' : 'pending' };
  async function serviceSupabase(url, options = {}) {
    const method = options.method || 'GET';
    requests.push({ url, method });
    if (url.startsWith('/rest/v1/internal_profiles?')) return ok([profile]);
    if (url.startsWith('/rest/v1/maintenance_technicians?')) return ok(technicianKey ? [{ technician_key: technicianKey }] : []);
    if (method === 'GET' && url.startsWith('/rest/v1/maintenance_jobs?')) return ok([job]);
    if (method === 'GET' && url.startsWith('/rest/v1/maintenance_job_attachments?')) return ok(attachmentsPresent ? [{ id: 1, job_id: 1, bucket_id: 'maintenance-closeouts', object_path: '1/fixture.jpg' }] : []);
    if (method === 'GET' && url.startsWith('/rest/v1/rfd_feedback_workflow?')) return ok();
    if (url.startsWith('/storage/v1/object/sign/')) return ok({ signedURL: '/signed-test-image' });
    if (['POST', 'PATCH', 'DELETE'].includes(method)) {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      writes.push({ url, method, body });
      if (url === '/rest/v1/rpc/complete_maintenance_job') return ok([{ ...job, status: 'completed' }]);
      if (url.startsWith('/storage/v1/object/')) return ok({ Key: 'fixture.jpg' });
      return ok([{ id: 1, ...body }]);
    }
    throw new Error(`Unexpected mocked ${method} ${url}`);
  }
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, `../api/${route}.js`), 'utf8');
  vm.runInNewContext(source, {
    module,
    Buffer,
    console,
    require(name) {
      if (name === './_internal-auth') return {
        currentUser: async () => loggedIn ? { user: { id: 'verified-test-user', email }, token: 'unit-test-session' } : null,
        readJson: async (req) => req.body,
        send(res, status, body) { res.statusCode = status; res.body = body; },
        serviceSupabase,
        supabase: serviceSupabase,
      };
      if (name === './_rating-feedback-data.json') return dashboardData;
      if (name === 'node:crypto') return require(name);
      throw new Error(`Unexpected module ${name}`);
    },
  });
  return { handler: module.exports, requests, writes };
}

const jobValues = {
  branch: 'สาทร', jobType: 'ซ่อมบำรุง', scheduledDate: '2026-11-04', scheduledTime: '10:00',
  assignedTo: ['นอส'], title: 'Unit test job', description: 'Unit test only',
};

test('Card 03 publishes Krissana and Pachara as branch-wide operations managers', async () => {
  const h = harness('rating-feedback');
  const res = response();
  await h.handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  for (const email of ['pachara.r@kumtsu.com', 'krissana.s@kumtsu.com']) {
    assert.ok(res.body.areaManagers.some((entry) => entry.email === email && entry.role === 'operations_manager' && entry.branch === '*'));
  }
  assert.equal(res.body.areaManagers.length, dashboardData.areaManagers.length + 2);
});

test('Card 03 lets Krissana update feedback across different branches with normalized email', async () => {
  const first = dashboardData.records[0];
  const other = dashboardData.records.find((record) => record.branch !== first.branch);
  assert.ok(other);
  for (const record of [first, other]) {
    const h = harness('rating-feedback', { email: 'KRISSANA.S@KUMTSU.COM' });
    const res = response();
    await h.handler({ method: 'PUT', body: { reviewId: record.id, status: 'in_progress' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.issue.updatedBy, 'krissana.s@kumtsu.com');
    assert.ok(h.writes.some(({ url, body }) => url.startsWith('/rest/v1/rfd_feedback_workflow?') && body.updated_by_email === 'krissana.s@kumtsu.com'));
  }
});

test('Card 03 preserves Pachara editing and rejects ordinary, pending, and logged-out users', async () => {
  for (const [options, expected] of [
    [{ email: 'pachara.r@kumtsu.com' }, 200],
    [{ email: 'unit-test-employee@kumtsu.com' }, 403],
    [{ active: false }, 403],
    [{ loggedIn: false }, 401],
  ]) {
    const h = harness('rating-feedback', options);
    const res = response();
    await h.handler({ method: 'PUT', body: { reviewId: dashboardData.records[0].id, status: 'resolved' } }, res);
    assert.equal(res.statusCode, expected);
    if (expected !== 200) assert.equal(h.writes.length, 0);
  }
});

test('Card 06 returns canManage for all existing and new admins', async () => {
  for (const email of MAINTENANCE_ADMINS) {
    const h = harness('maintenance', { email: ` ${email.toUpperCase()} ` });
    const res = response();
    await h.handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.permissions.canManage, true);
  }
});

test('Card 06 preserves admin create, edit, and status-update paths including Krissana', async () => {
  for (const email of MAINTENANCE_ADMINS) {
    for (const [method, body, expected] of [
      ['POST', jobValues, 201],
      ['PATCH', { id: 1, action: 'edit', ...jobValues }, 200],
      ['PATCH', { id: 1, status: 'progress' }, 200],
    ]) {
      const h = harness('maintenance', { email });
      const res = response();
      await h.handler({ method, body }, res);
      assert.equal(res.statusCode, expected);
      const write = h.writes.find(({ url }) => url.startsWith('/rest/v1/maintenance_jobs'));
      assert.equal(write.body.updated_by_email, email);
    }
  }
});

test('Card 06 blocks ordinary users from create/edit/status updates and reports read-only permission', async () => {
  for (const [method, body] of [
    ['POST', jobValues],
    ['PATCH', { id: 1, action: 'edit', ...jobValues }],
    ['PATCH', { id: 1, status: 'progress' }],
  ]) {
    const h = harness('maintenance', { email: 'unit-test-employee@kumtsu.com' });
    const res = response();
    await h.handler({ method, body }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(h.writes.length, 0);
  }
  const h = harness('maintenance', { email: 'unit-test-employee@kumtsu.com' });
  const res = response();
  await h.handler({ method: 'GET' }, res);
  assert.equal(res.body.permissions.canManage, false);
});

test('Card 06 keeps active-profile and login requirements', async () => {
  for (const [options, expected] of [[{ active: false }, 403], [{ loggedIn: false }, 401]]) {
    const h = harness('maintenance', options);
    const res = response();
    await h.handler({ method: 'POST', body: jobValues }, res);
    assert.equal(res.statusCode, expected);
    assert.equal(h.writes.length, 0);
  }
});

test('maintenance close accepts all admins without requiring technician assignment', async () => {
  for (const email of MAINTENANCE_ADMINS) {
    const h = harness('maintenance-close', { email: ` ${email.toUpperCase()} `, assignedTo: [], technicianKey: null });
    const res = response();
    await h.handler({ method: 'POST', body: { id: 1 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(h.requests.some(({ url }) => url.startsWith('/rest/v1/maintenance_technicians?')), false);
    const rpc = h.writes.find(({ url }) => url === '/rest/v1/rpc/complete_maintenance_job');
    assert.equal(rpc.body.p_actor_email, email);
  }
});

test('maintenance close preserves assigned-technician fallback and blocks other employees', async () => {
  for (const [options, expected] of [
    [{ email: 'unit-test-tech@kumtsu.com', technicianKey: 'นอส', assignedTo: ['นอส'] }, 200],
    [{ email: 'unit-test-tech@kumtsu.com', technicianKey: 'นอส', assignedTo: ['เอฟ'] }, 403],
    [{ email: 'unit-test-employee@kumtsu.com', technicianKey: null }, 403],
  ]) {
    const h = harness('maintenance-close', options);
    const res = response();
    await h.handler({ method: 'POST', body: { id: 1 } }, res);
    assert.equal(res.statusCode, expected);
    if (expected !== 200) assert.equal(h.writes.length, 0);
  }
});

test('maintenance close still requires image evidence for the new admin', async () => {
  const h = harness('maintenance-close', { attachmentsPresent: false });
  const res = response();
  await h.handler({ method: 'POST', body: { id: 1 } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(h.writes.length, 0);
});

test('maintenance image accepts all admins without requiring technician assignment', async () => {
  for (const email of MAINTENANCE_ADMINS) {
    const h = harness('maintenance-image', { email: ` ${email.toUpperCase()} `, assignedTo: [], technicianKey: null });
    const res = response();
    await h.handler({ method: 'POST', body: { id: 1, image: { type: 'image/jpeg', name: 'proof.jpg', base64: JPEG } } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(h.requests.some(({ url }) => url.startsWith('/rest/v1/maintenance_technicians?')), false);
    assert.ok(h.writes.some(({ url }) => url.startsWith('/storage/v1/object/maintenance-closeouts/')));
    const metadata = h.writes.find(({ url }) => url === '/rest/v1/maintenance_job_attachments');
    assert.equal(metadata.body.uploaded_by_email, email);
  }
});

test('maintenance image preserves assigned-technician fallback and blocks other employees', async () => {
  for (const [options, expected] of [
    [{ email: 'unit-test-tech@kumtsu.com', technicianKey: 'นอส', assignedTo: ['นอส'] }, 201],
    [{ email: 'unit-test-tech@kumtsu.com', technicianKey: 'นอส', assignedTo: ['เอฟ'] }, 403],
    [{ email: 'unit-test-employee@kumtsu.com', technicianKey: null }, 403],
  ]) {
    const h = harness('maintenance-image', options);
    const res = response();
    await h.handler({ method: 'POST', body: { id: 1, image: { type: 'image/jpeg', name: 'proof.jpg', base64: JPEG } } }, res);
    assert.equal(res.statusCode, expected);
    if (expected !== 201) assert.equal(h.writes.length, 0);
  }
});

test('maintenance image still validates image bytes for the new admin', async () => {
  const h = harness('maintenance-image');
  const res = response();
  await h.handler({ method: 'POST', body: { id: 1, image: { type: 'image/jpeg', name: 'proof.jpg', base64: Buffer.from('invalid-image').toString('base64') } } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(h.writes.length, 0);
});

test('maintenance close and image still require a login', async () => {
  for (const route of ['maintenance-close', 'maintenance-image']) {
    const h = harness(route, { loggedIn: false });
    const res = response();
    await h.handler({ method: 'POST', body: { id: 1, image: { type: 'image/jpeg', name: 'proof.jpg', base64: JPEG } } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(h.writes.length, 0);
  }
});
