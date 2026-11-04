const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const authSource = fs.readFileSync(path.join(__dirname, '../api/_internal-auth.js'), 'utf8');
const handlerSource = fs.readFileSync(path.join(__dirname, '../api/cloud-kitchen.js'), 'utf8');
const APPROVED_EDITORS = ['pachara.r@kumtsu.com', 'ruttapong.k@kumtsu.com', 'krissana.s@kumtsu.com'];

function harness({
  authEmail = 'krissana.s@kumtsu.com',
  profileEmail = authEmail,
  status = 'active',
  loggedIn = true,
  validSession = true,
  profilePresent = true,
} = {}) {
  const requests = [];
  const writes = [];
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || 'GET';
    requests.push({ path: parsed.pathname, method });
    let ok = true;
    let data;
    if (parsed.pathname === '/auth/v1/user') {
      assert.equal(options.headers.Authorization, 'Bearer card08-unit-session');
      ok = validSession;
      data = ok ? { id: 'card08-verified-user', email: authEmail } : { message: 'Invalid session' };
    } else if (parsed.pathname === '/rest/v1/internal_profiles') {
      assert.equal(parsed.searchParams.get('user_id'), 'eq.card08-verified-user');
      data = profilePresent ? [{ user_id: 'card08-verified-user', email: profileEmail, status }] : [];
    } else if (parsed.pathname === '/rest/v1/cloud_kitchen_branches' && method === 'POST') {
      assert.equal(parsed.searchParams.get('on_conflict'), 'branch_code');
      assert.equal(options.headers.Authorization, 'Bearer card08-unit-service-key');
      const body = JSON.parse(options.body);
      writes.push({ method, body });
      data = [body];
    } else {
      throw new Error(`Unexpected mocked request: ${method} ${parsed.pathname}${parsed.search}`);
    }
    return { ok, text: async () => JSON.stringify(data) };
  };

  const authModule = { exports: {} };
  vm.runInNewContext(authSource, {
    module: authModule,
    fetch,
    process: { env: {
      SUPABASE_URL: 'https://card08.unit-test.invalid',
      SUPABASE_PUBLISHABLE_KEY: 'card08-unit-public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'card08-unit-service-key',
    } },
  });

  const handlerModule = { exports: {} };
  vm.runInNewContext(handlerSource, {
    module: handlerModule,
    console,
    require(name) {
      if (name === './_internal-auth') return authModule.exports;
      if (name === './_cloud-kitchen-seed.json') return require('../api/_cloud-kitchen-seed.json');
      if (name === 'node:crypto') return require(name);
      throw new Error(`Unexpected module ${name}`);
    },
  });

  return {
    handler: handlerModule.exports,
    requests,
    writes,
    req: {
      method: 'PATCH',
      headers: loggedIn ? { authorization: 'Bearer card08-unit-session' } : {},
      body: { action: 'save-branch', branchCode: 'BR051', data: { staff: 7, status: 'active' } },
    },
  };
}

function response() {
  return {
    setHeader() {},
    end(text) { this.body = JSON.parse(text); },
  };
}

for (const email of APPROVED_EDITORS) {
  test(`Card 08 save-branch accepts verified active editor ${email} and preserves normalized actor`, async () => {
    const h = harness({ authEmail: ` ${email.toUpperCase()} `, profileEmail: 'employee@kumtsu.com' });
    const res = response();
    await h.handler(h.req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].body.updated_by_email, email);
    assert.equal(h.writes[0].body.branch_code, 'BR051');
    assert.deepEqual(h.writes[0].body.data, h.req.body.data);
    assert.ok(Number.isFinite(Date.parse(h.writes[0].body.updated_at)));
    assert.deepEqual(h.requests.map(({ path }) => path), [
      '/auth/v1/user', '/rest/v1/internal_profiles', '/rest/v1/cloud_kitchen_branches',
    ]);
  });
}

test('Card 08 save-branch denies ordinary and near-match emails even with an approved profile email', async () => {
  for (const email of ['employee@kumtsu.com', 'krissana.s@kumtsu.com.example', 'otherkrissana.s@kumtsu.com']) {
    const h = harness({ authEmail: email, profileEmail: 'krissana.s@kumtsu.com' });
    const res = response();
    await h.handler(h.req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(h.writes.length, 0);
  }
});

test('Card 08 save-branch denies unapproved and missing profiles even for approved editors', async () => {
  for (const state of [{ status: 'inactive' }, { status: 'pending' }, { status: 'rejected' }, { profilePresent: false }]) {
    const h = harness(state);
    const res = response();
    await h.handler(h.req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(h.writes.length, 0);
  }
});

test('Card 08 save-branch requires a valid session before any profile or data writes', async () => {
  for (const state of [{ loggedIn: false }, { validSession: false }]) {
    const h = harness(state);
    const res = response();
    await h.handler(h.req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(h.writes.length, 0);
    assert.equal(h.requests.some(({ path }) => path === '/rest/v1/internal_profiles'), false);
  }
});
