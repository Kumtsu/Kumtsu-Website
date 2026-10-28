const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.BRANCH_ACCESS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const helpers = require('../api/_branch-access');
const source = fs.readFileSync(path.join(__dirname, '../api/branch-access.js'), 'utf8');

function loadHandler(serviceSupabase, canEdit = true) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    console,
    require(name) {
      if (name === './_internal-auth') return {
        readJson: async (req) => req.body,
        send(res, status, body) { res.statusCode = status; res.body = body; },
        serviceSupabase,
      };
      if (name === './_branch-access') return {
        ...helpers,
        requireActiveUser: async () => ({ canEdit, auth: { user: { email: helpers.ADMIN_EMAIL } } }),
      };
      if (name === '../internal/branch-access-catalog') return require(name);
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return module.exports;
}

function response() { return { setHeader() {} }; }
function ok(data = []) { return { response: { ok: true }, data }; }

test('non-admins cannot create brands or channels through the API', async () => {
  let requests = 0;
  const handler = loadHandler(async () => { requests += 1; throw new Error('Must not query'); }, false);
  for (const entity of ['brand', 'channel']) {
    const res = response();
    await handler({ method: 'POST', body: { entity, values: {} } }, res);
    assert.equal(res.statusCode, 403);
  }
  assert.equal(requests, 0);
});

test('brand creation derives the code from the database branch and redacts audit secrets', async () => {
  let inserted;
  let audit;
  const handler = loadHandler(async (url, options = {}) => {
    if (url.includes('branch_access_branches?')) return ok([{ id: 51, code: 'BR051' }]);
    if (url.includes('&name=eq.')) return ok();
    if (url.includes('order=id.desc')) return ok([{ id: 207 }]);
    if (url === '/rest/v1/branch_access_brands' && options.method === 'POST') {
      inserted = JSON.parse(options.body);
      return ok([inserted]);
    }
    if (url === '/rest/v1/branch_access_audit') { audit = JSON.parse(options.body); return ok(); }
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'brand', values: { branch_id: 51, name: 'คุ้มสึ', code: 'TAMPERED999', login_identifier: 'example@kumtsu.com', password: 'Example-123' } } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(inserted.code, 'KS051');
  assert.equal(inserted.id, 208);
  assert.equal(helpers.decryptSecret(inserted.password_encrypted), 'Example-123');
  assert.equal(inserted.password, undefined);
  assert.equal(audit.changes.password_encrypted, '[created]');
  assert.equal(JSON.stringify(res.body).includes('Example-123'), false);
});

test('channel creation checks its parent brand and encrypts credentials', async () => {
  let inserted;
  const handler = loadHandler(async (url, options = {}) => {
    if (url.includes('branch_access_brands?select=id,branch_id&id=eq.208')) return ok([{ id: 208, branch_id: 51 }]);
    if (url.includes('&name=eq.Grab')) return ok();
    if (url.includes('order=id.desc')) return ok([{ id: 829 }]);
    if (url === '/rest/v1/branch_access_channels' && options.method === 'POST') {
      inserted = JSON.parse(options.body);
      return ok([inserted]);
    }
    if (url === '/rest/v1/branch_access_audit') return ok();
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'channel', values: { brand_id: 208, name: 'Grab', login_identifier: 'example@kumtsu.com', password: 'Channel-123' } } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(inserted.brand_id, 208);
  assert.equal(inserted.id, 830);
  assert.equal(helpers.decryptSecret(inserted.password_encrypted), 'Channel-123');
  assert.equal(res.body.message, 'เพิ่มช่องทางขายแล้ว');
});

test('creation rejects missing parent records before inserting', async () => {
  let writes = 0;
  const handler = loadHandler(async (_url, options = {}) => { if (options.method === 'POST') writes += 1; return ok(); });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'channel', values: { brand_id: 999, name: 'Grab', login_identifier: 'example', password: 'secret' } } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(writes, 0);
});

test('a branch cannot add FoodStory again under a different brand', async () => {
  let writes = 0;
  const handler = loadHandler(async (url, options = {}) => {
    if (options.method === 'POST') writes += 1;
    if (url.includes('select=id,branch_id&id=eq.208')) return ok([{ id: 208, branch_id: 51 }]);
    if (url.includes('brand_id=eq.208&name=eq.')) return ok();
    if (url.includes('branch_access_brands?select=id&branch_id=eq.51')) return ok([{ id: 208 }, { id: 209 }]);
    if (url.includes('brand_id=in.(208,209)&name=ilike.food*story*')) return ok([{ id: 900 }]);
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'channel', values: { brand_id: 208, name: 'Foodstory', login_identifier: 'example', password: 'secret' } } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /FoodStory/);
  assert.equal(writes, 0);
});

test('a channel cannot be added twice to the same brand', async () => {
  let writes = 0;
  const handler = loadHandler(async (url, options = {}) => {
    if (options.method === 'POST') writes += 1;
    if (url.includes('select=id,branch_id&id=eq.208')) return ok([{ id: 208, branch_id: 51 }]);
    if (url.includes('brand_id=eq.208&name=eq.Grab')) return ok([{ id: 901 }]);
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'channel', values: { brand_id: 208, name: 'Grab', login_identifier: 'example', password: 'secret' } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(writes, 0);
});
