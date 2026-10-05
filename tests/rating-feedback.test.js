const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';

const handler = require('../api/rating-feedback');

function request(authorization = '') {
  return { method: 'GET', headers: { authorization } };
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

test('rejects requests without an authenticated session', async () => {
  const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 401);
});

test('returns all review records to an active internal user', async (t) => {
  t.mock.method(global, 'fetch', async (url) => {
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'user-1', email: 'ai.y@kumtsu.com' }), { status: 200 });
    }
    if (url.includes('/rest/v1/rfd_feedback_workflow')) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify([{
      employee_id: 'KM001',
      first_name: 'อ้าย',
      last_name: 'ใยเยี่ยม',
      email: 'ai.y@kumtsu.com',
      status: 'active',
    }]), { status: 200 });
  });

  const res = response();
  await handler(request('Bearer valid-token'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.records.length, 345);
  assert.deepEqual(res.body.issues, {});
  assert.ok(res.body.areaManagers.some((entry) => entry.email === 'pachara.r@kumtsu.com' && entry.branch === '*'));
  assert.equal(res.body.profile.status, 'active');
});

test('rejects an internal profile that is not active', async (t) => {
  t.mock.method(global, 'fetch', async (url) => {
    if (url.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'user-2', email: 'pending@kumtsu.com' }), { status: 200 });
    }
    return new Response(JSON.stringify([{
      employee_id: 'KM002',
      first_name: 'Pending',
      last_name: 'User',
      email: 'pending@kumtsu.com',
      status: 'pending',
    }]), { status: 200 });
  });

  const res = response();
  await handler(request('Bearer valid-token'), res);
  assert.equal(res.statusCode, 403);
});
