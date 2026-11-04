const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const authSource = fs.readFileSync(path.join(__dirname, '../api/_internal-auth.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(__dirname, '../api/_branch-access.js'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, '../api/branch-access.js'), 'utf8');
const catalog = require('../internal/branch-access-catalog');
const EDITORS = ['pachara.r@kumtsu.com', 'krissana.s@kumtsu.com'];

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(text) { this.body = JSON.parse(text); },
  };
}

function harness({
  authEmail = 'krissana.s@kumtsu.com',
  profileEmail = authEmail,
  status = 'active',
  loggedIn = true,
  authOk = true,
  profilePresent = true,
  profileOk = true,
} = {}) {
  const requests = [];
  const writes = [];
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || 'GET';
    requests.push({ pathname: parsed.pathname, method });
    let data;
    let ok = true;
    if (parsed.pathname === '/auth/v1/user') {
      assert.equal(options.headers.Authorization, 'Bearer unit-test-session');
      ok = authOk;
      data = ok ? { id: 'verified-user-id', email: authEmail } : { message: 'Invalid session' };
    } else if (parsed.pathname === '/rest/v1/internal_profiles') {
      assert.equal(parsed.searchParams.get('user_id'), 'eq.verified-user-id');
      ok = profileOk;
      data = profilePresent ? [{ email: profileEmail, status, first_name: 'Test', last_name: 'User' }] : [];
    } else if (method === 'GET' && parsed.pathname === '/rest/v1/branch_access_branches' && parsed.searchParams.get('order') === 'id.desc') {
      data = [{ id: 51 }];
    } else if (['POST', 'PATCH'].includes(method) && ['/rest/v1/branch_access_branches', '/rest/v1/branch_access_audit'].includes(parsed.pathname)) {
      const body = JSON.parse(options.body);
      writes.push({ pathname: parsed.pathname, method, body });
      data = [{ id: body.id || 1 }];
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
      SUPABASE_URL: 'https://supabase.unit-test.invalid',
      SUPABASE_PUBLISHABLE_KEY: 'unit-test-public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-key',
    } },
  });

  const helperModule = { exports: {} };
  vm.runInNewContext(helperSource, {
    module: helperModule,
    require(name) {
      if (name === './_internal-auth') return authModule.exports;
      if (name === '../internal/branch-access-catalog') return catalog;
      if (name === 'node:crypto') return require(name);
      throw new Error(`Unexpected helper module: ${name}`);
    },
  });

  const apiModule = { exports: {} };
  vm.runInNewContext(apiSource, {
    module: apiModule,
    console,
    require(name) {
      if (name === './_internal-auth') return authModule.exports;
      if (name === './_branch-access') return helperModule.exports;
      if (name === '../internal/branch-access-catalog') return catalog;
      throw new Error(`Unexpected API module: ${name}`);
    },
  });

  return {
    helper: helperModule.exports,
    sharedAuth: authModule.exports,
    handler: apiModule.exports,
    req: { headers: loggedIn ? { authorization: 'Bearer unit-test-session' } : {} },
    requests,
    writes,
  };
}

test('Card 04 exposes a frozen allowlist containing exactly the two approved editors', () => {
  const { helper } = harness();
  assert.equal(Object.isFrozen(helper.ADMIN_EMAILS), true);
  assert.deepEqual(Array.from(helper.ADMIN_EMAILS), EDITORS);
  assert.equal(helper.ADMIN_EMAIL, 'pachara.r@kumtsu.com');
});

for (const email of EDITORS) {
  test(`Card 04 grants active verified editor ${email} after case and whitespace normalization`, async () => {
    const h = harness({ authEmail: ` ${email.toUpperCase()} `, profileEmail: 'employee@kumtsu.com' });
    const res = response();
    const access = await h.helper.requireActiveUser(h.req, res);
    assert.equal(access.canEdit, true);
    assert.equal(access.auth.user.id, 'verified-user-id');
    assert.equal(h.requests.filter(({ pathname }) => pathname === '/auth/v1/user').length, 1);
    assert.equal(h.requests.filter(({ pathname }) => pathname === '/rest/v1/internal_profiles').length, 1);
  });
}

test('active ordinary employees can read Card 04 but cannot edit', async () => {
  const h = harness({ authEmail: 'employee@kumtsu.com' });
  const access = await h.helper.requireActiveUser(h.req, response());
  assert.equal(access.canEdit, false);
});

test('a verified ordinary email cannot gain Card 04 editing rights through a spoofed admin profile email', async () => {
  for (const profileEmail of EDITORS) {
    const h = harness({ authEmail: 'employee@kumtsu.com', profileEmail });
    const access = await h.helper.requireActiveUser(h.req, response());
    assert.equal(access.canEdit, false);
  }
});

test('Card 04 denies pending, inactive, and rejected profiles even for an allowlisted email', async () => {
  for (const status of ['pending', 'inactive', 'rejected']) {
    const h = harness({ status });
    const res = response();
    assert.equal(await h.helper.requireActiveUser(h.req, res), null);
    assert.equal(res.statusCode, 403);
  }
});

test('Card 04 denies missing or unreadable approval profiles', async () => {
  for (const state of [{ profilePresent: false }, { profileOk: false }]) {
    const h = harness(state);
    const res = response();
    assert.equal(await h.helper.requireActiveUser(h.req, res), null);
    assert.equal(res.statusCode, 403);
  }
});

test('Card 04 requires a valid login before reading a profile', async () => {
  for (const state of [{ loggedIn: false }, { authOk: false }]) {
    const h = harness(state);
    const res = response();
    assert.equal(await h.helper.requireActiveUser(h.req, res), null);
    assert.equal(res.statusCode, 401);
    assert.equal(h.requests.some(({ pathname }) => pathname === '/rest/v1/internal_profiles'), false);
  }
});

test('the shared adminUser helper still rejects Krissana and accepts only the existing global admin', async () => {
  const newCard04Editor = harness();
  assert.equal(await newCard04Editor.sharedAuth.adminUser(newCard04Editor.req), null);

  const originalAdmin = harness({ authEmail: 'pachara.r@kumtsu.com', profileEmail: ' PACHARA.R@KUMTSU.COM ' });
  const access = await originalAdmin.sharedAuth.adminUser(originalAdmin.req);
  assert.equal(access.user.email, 'pachara.r@kumtsu.com');
});

async function card05Access({ email = 'krissana.s@kumtsu.com', profileEmail = email, session = true, responseOk = true, protocol = 'https:' } = {}) {
  const card05 = fs.readFileSync(path.join(__dirname, '../internal/sol-detail.html'), 'utf8');
  const start = card05.indexOf("const ADMIN_EMAIL =");
  const end = card05.indexOf('\nconst MENUS=');
  assert.ok(start >= 0 && end > start);
  const authSection = card05.slice(start, end).replace("await import('./auth.js')", 'services');
  const adminButton = { hidden: true };
  const requests = [];
  const run = vm.runInNewContext(`(async () => { ${authSection} })()`, {
    location: { protocol },
    document: { querySelector(selector) { assert.equal(selector, '#admin'); return adminButton; } },
    services: {
      requireSession() { return session; },
      async api(url) {
        requests.push(url);
        return { response: { ok: responseOk }, data: { user: { email }, profile: { email: profileEmail }, message: 'Not approved' } };
      },
    },
  });
  return { run, adminButton, requests };
}

test('Card 05 permits exactly the approved editors after the dashboard access check', async () => {
  for (const email of EDITORS) {
    const h = await card05Access({ email: ` ${email.toUpperCase()} ` });
    await h.run;
    assert.equal(h.adminButton.hidden, false);
    assert.deepEqual(h.requests, ['/api/internal-dashboard']);
  }
  for (const email of ['employee@kumtsu.com', 'krissana.s@kumtsu.com.example', 'otherkrissana.s@kumtsu.com']) {
    const h = await card05Access({ email, profileEmail: 'krissana.s@kumtsu.com' });
    await h.run;
    assert.equal(h.adminButton.hidden, true);
  }
});

test('Card 05 still denies missing sessions, failed dashboard approval, and local-file admin access', async () => {
  const noSession = await card05Access({ session: false });
  await assert.rejects(noSession.run, /Authentication required/);
  assert.equal(noSession.adminButton.hidden, true);
  assert.equal(noSession.requests.length, 0);

  const notApproved = await card05Access({ responseOk: false });
  await assert.rejects(notApproved.run, /Not approved/);
  assert.equal(notApproved.adminButton.hidden, true);

  const local = await card05Access({ protocol: 'file:' });
  await local.run;
  assert.equal(local.adminButton.hidden, true);
  assert.equal(local.requests.length, 0);
});

for (const email of EDITORS) {
  test(`Card 04 PATCH and POST permit ${email} through the actual verified-user helper`, async () => {
    for (const method of ['PATCH', 'POST']) {
      const h = harness({ authEmail: email });
      const res = response();
      const body = method === 'PATCH'
        ? { entity: 'branch', id: 51, changes: { name: 'Unit test branch' } }
        : { entity: 'branch', values: { code: 'BR052', name: 'Unit test branch' } };
      await h.handler({ ...h.req, method, body }, res);
      assert.equal(res.statusCode, method === 'PATCH' ? 200 : 201);
      assert.equal(h.writes.filter(({ pathname }) => pathname === '/rest/v1/branch_access_branches').length, 1);
      assert.equal(h.writes.filter(({ pathname }) => pathname === '/rest/v1/branch_access_audit').length, 1);
      const audit = h.writes.find(({ pathname }) => pathname === '/rest/v1/branch_access_audit');
      assert.equal(audit.body.actor_email, email);
    }
  });
}

test('Card 04 PATCH and POST reject ordinary, unapproved, and unauthenticated users before writes', async () => {
  const scenarios = [
    { options: { authEmail: 'employee@kumtsu.com' }, status: 403 },
    { options: { authEmail: 'employee@kumtsu.com', profileEmail: 'krissana.s@kumtsu.com' }, status: 403 },
    { options: { status: 'pending' }, status: 403 },
    { options: { loggedIn: false }, status: 401 },
  ];
  for (const { options, status } of scenarios) {
    for (const method of ['PATCH', 'POST']) {
      const h = harness(options);
      const res = response();
      await h.handler({ ...h.req, method, body: { entity: 'branch', id: 51, changes: { name: 'Unit test' }, values: { code: 'BR052', name: 'Unit test' } } }, res);
      assert.equal(res.statusCode, status);
      assert.equal(h.writes.length, 0);
    }
  }
});
