const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.ok(res.body.areaManagers.some((entry) => (
    entry.email === 'pachara.r@kumtsu.com'
    && entry.branch === '*'
    && entry.name === 'พัชระ รัตนเขมากร'
  )));
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

test('allows authorized users to update status directly in Action Required', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'internal', 'rating-feedback.html'), 'utf8');
  assert.match(dashboard, /aria-label="ปรับสถานะ Action Required"/);
  assert.match(dashboard, /allowed\?`<select[^`]+setStatus\('\$\{r\.id\}'/);
  assert.match(dashboard, /:'<span class="readonly">ดูได้อย่างเดียว<\/span>'/);
  assert.match(dashboard, /function ratingPalette\(rating\)/);
  assert.match(dashboard, /class="actionrow" style="--review-bg:\$\{palette\[0\]\};--review-accent:\$\{palette\[1\]\};--review-border:\$\{palette\[2\]\}"/);
});

test('uses a charcoal page background while keeping content cards light', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'internal', 'rating-feedback.html'), 'utf8');
  assert.match(dashboard, /--bg:#24282F/);
  assert.match(dashboard, /--card:#FFFFFF/);
  assert.match(dashboard, /\.hero>div:first-child h1\{color:#F8FAFC\}/);
});
