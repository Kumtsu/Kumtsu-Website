const assert = require('node:assert/strict');
const test = require('node:test');

const authPath = require.resolve('../api/_internal-auth');
const handlerPath = require.resolve('../api/internal-forgot-password');

function loadHandler(serviceSupabase) {
  delete require.cache[handlerPath];
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      readJson: async (req) => req.body,
      send(res, status, body) {
        res.statusCode = status;
        res.body = body;
      },
      serviceSupabase,
    },
  };
  return require(handlerPath);
}

function response() {
  return { setHeader() {} };
}

test('creates a Supabase recovery link and sends it through Resend', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.PUBLIC_SITE_URL = 'https://www.kumtsu.com';
  process.env.APPROVAL_EMAIL_FROM = 'Kumtsu Admin <account.it@kumtsu.com>';

  let linkRequest;
  let emailRequest;
  const handler = loadHandler(async (path, options) => {
    linkRequest = { path, body: JSON.parse(options.body) };
    return { response: { ok: true }, data: { action_link: 'https://auth.example/recover?token=abc' } };
  });
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    emailRequest = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ id: 'email-123' }) };
  };

  try {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { email: 'employee@kumtsu.com' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(linkRequest.path, '/auth/v1/admin/generate_link');
    assert.deepEqual(linkRequest.body, {
      type: 'recovery',
      email: 'employee@kumtsu.com',
      redirect_to: 'https://www.kumtsu.com/internal/reset-password.html',
    });
    assert.equal(emailRequest.url, 'https://api.resend.com/emails');
    assert.deepEqual(emailRequest.body.to, ['employee@kumtsu.com']);
    assert.match(emailRequest.body.html, /https:\/\/auth\.example\/recover\?token=abc/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('does not claim success when Supabase cannot create a recovery link', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  const handler = loadHandler(async () => ({
    response: { ok: false, status: 500 },
    data: { message: 'database unavailable' },
  }));
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { email: 'employee2@kumtsu.com' } }, res);
  assert.equal(res.statusCode, 503);
});

test('keeps unknown accounts private and does not send email', async () => {
  process.env.RESEND_API_KEY = 'test-key';
  const handler = loadHandler(async () => ({
    response: { ok: false, status: 404 },
    data: { message: 'User not found' },
  }));
  const originalFetch = global.fetch;
  let emailWasSent = false;
  global.fetch = async () => {
    emailWasSent = true;
    throw new Error('unexpected');
  };

  try {
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { email: 'unknown@kumtsu.com' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(emailWasSent, false);
  } finally {
    global.fetch = originalFetch;
  }
});
