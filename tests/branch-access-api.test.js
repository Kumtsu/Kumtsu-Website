const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

process.env.BRANCH_ACCESS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const helpers = require('../api/_branch-access');
const source = fs.readFileSync(path.join(__dirname, '../api/branch-access.js'), 'utf8');
const helperSource = fs.readFileSync(path.join(__dirname, '../api/_branch-access.js'), 'utf8');

function loadHelpers(serviceSupabase) {
  const module = { exports: {} };
  vm.runInNewContext(helperSource, {
    module,
    require(name) {
      if (name === './_internal-auth') return { serviceSupabase };
      if (name === 'node:crypto') return require(name);
      if (name === '../internal/branch-access-catalog') return require(name);
      throw new Error(`Unexpected module ${name}`);
    },
  });
  return module.exports;
}

function loadHandler(serviceSupabase, canEdit = true, handlerSource = source) {
  const module = { exports: {} };
  vm.runInNewContext(handlerSource, {
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

test('non-admins cannot create brands, channels, or FoodStory through the API', async () => {
  let requests = 0;
  const handler = loadHandler(async () => { requests += 1; throw new Error('Must not query'); }, false);
  for (const entity of ['brand', 'channel', 'foodstory']) {
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
    if (url.includes('branch_access_foodstory?select=id&branch_id=eq.51')) return ok();
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

test('FoodStory can be created directly for a branch with no brands', async () => {
  let inserted;
  let audit;
  let brandWrites = 0;
  const handler = loadHandler(async (url, options = {}) => {
    if (url.includes('branch_access_branches?select=id&id=eq.51')) return ok([{ id: 51 }]);
    if (url.includes('branch_access_foodstory?select=id&branch_id=eq.51')) return ok();
    if (url.includes('branch_access_brands?select=id&branch_id=eq.51')) return ok();
    if (url.includes('branch_access_foodstory?select=id&order=id.desc')) return ok();
    if (url === '/rest/v1/branch_access_foodstory' && options.method === 'POST') {
      inserted = JSON.parse(options.body);
      return ok([inserted]);
    }
    if (url === '/rest/v1/branch_access_audit') { audit = JSON.parse(options.body); return ok(); }
    if (url === '/rest/v1/branch_access_brands' && options.method === 'POST') brandWrites += 1;
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'foodstory', values: { branch_id: 51, login_identifier: 'pos@example.com', password: 'POS-1234' } } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(inserted.id, 1);
  assert.equal(inserted.branch_id, 51);
  assert.equal(inserted.brand_id, undefined);
  assert.equal(helpers.decryptSecret(inserted.password_encrypted), 'POS-1234');
  assert.equal(audit.entity_type, 'foodstory');
  assert.equal(audit.changes.password_encrypted, '[created]');
  assert.equal(brandWrites, 0);
});

test('standalone FoodStory creation rejects a legacy FoodStory account in the same branch', async () => {
  let writes = 0;
  const handler = loadHandler(async (url, options = {}) => {
    if (options.method === 'POST') writes += 1;
    if (url.includes('branch_access_branches?select=id&id=eq.51')) return ok([{ id: 51 }]);
    if (url.includes('branch_access_foodstory?select=id&branch_id=eq.51')) return ok();
    if (url.includes('branch_access_brands?select=id&branch_id=eq.51')) return ok([{ id: 208 }]);
    if (url.includes('brand_id=in.(208)&name=ilike.food*story*')) return ok([{ id: 830 }]);
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'POST', body: { entity: 'foodstory', values: { branch_id: 51, login_identifier: 'pos@example.com', password: 'POS-1234' } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(writes, 0);
});

test('both standalone and legacy creation reject an existing standalone FoodStory account', async () => {
  let writes = 0;
  const handler = loadHandler(async (url, options = {}) => {
    if (options.method === 'POST') writes += 1;
    if (url.includes('branch_access_branches?select=id&id=eq.51')) return ok([{ id: 51 }]);
    if (url.includes('branch_access_brands?select=id,branch_id&id=eq.208')) return ok([{ id: 208, branch_id: 51 }]);
    if (url.includes('brand_id=eq.208&name=eq.Foodstory')) return ok();
    if (url.includes('branch_access_foodstory?select=id&branch_id=eq.51')) return ok([{ id: 1 }]);
    throw new Error(`Unexpected URL ${url}`);
  });
  for (const [entity, parent] of [['foodstory', { branch_id: 51 }], ['channel', { brand_id: 208, name: 'Foodstory' }]]) {
    const res = response();
    await handler({ method: 'POST', body: { entity, values: { ...parent, login_identifier: 'pos@example.com', password: 'POS-1234' } } }, res);
    assert.equal(res.statusCode, 409);
  }
  assert.equal(writes, 0);
});

test('FoodStory updates keep the branch immutable and encrypt changed passwords', async () => {
  let changed;
  const handler = loadHandler(async (url, options = {}) => {
    if (url === '/rest/v1/branch_access_foodstory?id=eq.1' && options.method === 'PATCH') {
      changed = JSON.parse(options.body);
      return ok([{ id: 1 }]);
    }
    if (url === '/rest/v1/branch_access_audit') return ok();
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'PATCH', body: { entity: 'foodstory', id: 1, changes: { branch_id: 99, name: 'bad', login_identifier: 'updated@example.com', password: 'Changed-1234' } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(changed.branch_id, undefined);
  assert.equal(changed.name, undefined);
  assert.equal(changed.login_identifier, 'updated@example.com');
  assert.equal(helpers.decryptSecret(changed.password_encrypted), 'Changed-1234');
});

test('FoodStory updates remain restricted to the designated admin', async () => {
  let requests = 0;
  const handler = loadHandler(async () => { requests += 1; throw new Error('Must not query'); }, false);
  const res = response();
  await handler({ method: 'PATCH', body: { entity: 'foodstory', id: 1, changes: { login_identifier: 'new@example.com' } } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(requests, 0);
});

test('credential reveal supports standalone FoodStory for an active internal user', async () => {
  const credentialSource = fs.readFileSync(path.join(__dirname, '../api/branch-access-credential.js'), 'utf8');
  let lookup;
  const encrypted = helpers.encryptSecret('POS-1234');
  const handler = loadHandler(async (url) => { lookup = url; return ok([{ password_encrypted: encrypted }]); }, false, credentialSource);
  const res = response();
  await handler({ method: 'POST', body: { kind: 'foodstory', id: 1 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(lookup, '/rest/v1/branch_access_foodstory?id=eq.1&select=password_encrypted');
  assert.equal(res.body.password, 'POS-1234');
});

test('snapshot exposes only sanitized FoodStory rows', async () => {
  const isolatedHelpers = loadHelpers(async (url) => url.includes('branch_access_foodstory?')
    ? ok([{ id: 1, branch_id: 51, login_identifier: 'pos@example.com', password_encrypted: 'secret-ciphertext', wongnai_pos_pin_encrypted: 'pin-ciphertext' }])
    : url.includes('branch_access_channels?') ? ok([{ id: 830, name: 'Foodstory', password_encrypted: 'password-ciphertext', wongnai_pos_pin_encrypted: null }, { id: 831, name: 'Grab' }]) : ok());
  const snapshot = await isolatedHelpers.loadSnapshot();
  assert.equal(snapshot.foodstory.length, 1);
  assert.equal(snapshot.foodstory[0].branch_id, 51);
  assert.equal(snapshot.foodstory[0].login_identifier, 'pos@example.com');
  assert.equal(snapshot.foodstory[0].has_password, true);
  assert.equal(snapshot.foodstory[0].password_encrypted, undefined);
  assert.equal(snapshot.foodstory[0].wongnai_pos_pin_encrypted, undefined);
  assert.equal(snapshot.foodstory[0].has_wongnai_pos_pin, true);
  assert.equal(snapshot.channels[0].has_wongnai_pos_pin, false);
  assert.equal(snapshot.channels[1].has_wongnai_pos_pin, false);
  assert.equal(JSON.stringify(snapshot).includes('secret-ciphertext'), false);
  assert.equal(JSON.stringify(snapshot).includes('pin-ciphertext'), false);
});

test('snapshot retries missing PIN columns only and leaves all legacy PIN flags empty', async () => {
  const isolatedHelpers = loadHelpers(async (url) => {
    if (url.includes('wongnai_pos_pin_encrypted')) return { response: { ok: false }, data: { code: '42703', message: 'column wongnai_pos_pin_encrypted does not exist' } };
    if (url.includes('branch_access_channels?')) return ok([{ id: 1, name: 'Foodstory', password_encrypted: 'password-only' }]);
    if (url.includes('branch_access_foodstory?')) return ok([{ id: 2, branch_id: 51, password_encrypted: 'password-only' }]);
    return ok();
  });
  const snapshot = await isolatedHelpers.loadSnapshot();
  assert.equal(snapshot.channels[0].has_wongnai_pos_pin, false);
  assert.equal(snapshot.foodstory[0].has_wongnai_pos_pin, false);
  const unrelatedError = loadHelpers(async (url) => url.includes('branch_access_channels?')
    ? { response: { ok: false }, data: { code: '42703', message: 'column name does not exist' } } : ok());
  await assert.rejects(unrelatedError.loadSnapshot(), /column name/);
});

test('FoodStory create and edit encrypt PINs and redact audit values', async () => {
  const records = [];
  const audits = [];
  const handler = loadHandler(async (url, options = {}) => {
    if (url.includes('branch_access_branches?')) return ok([{ id: 51 }]);
    if (url.includes('branch_access_foodstory?select=id&branch_id=')) return ok();
    if (url.includes('branch_access_brands?')) return ok();
    if (url.includes('order=id.desc')) return ok();
    if (url.startsWith('/rest/v1/branch_access_foodstory') && ['POST', 'PATCH'].includes(options.method)) {
      records.push(JSON.parse(options.body));
      return ok([{ id: 1 }]);
    }
    if (url === '/rest/v1/branch_access_audit') { audits.push(JSON.parse(options.body)); return ok(); }
    throw new Error(`Unexpected URL ${url}`);
  });
  const created = response();
  await handler({ method: 'POST', body: { entity: 'foodstory', values: { branch_id: 51, login_identifier: 'pos@example.com', password: 'secret', wongnai_pos_pin: '0123' } } }, created);
  assert.equal(created.statusCode, 201);
  assert.equal(helpers.decryptSecret(records[0].wongnai_pos_pin_encrypted), '0123');
  assert.equal(records[0].wongnai_pos_pin, undefined);
  assert.equal(audits[0].changes.wongnai_pos_pin_encrypted, '[created]');
  const edited = response();
  await handler({ method: 'PATCH', body: { entity: 'foodstory', id: 1, changes: { wongnai_pos_pin: '0000' } } }, edited);
  assert.equal(edited.statusCode, 200);
  assert.equal(helpers.decryptSecret(records[1].wongnai_pos_pin_encrypted), '0000');
  assert.equal(audits[1].changes.wongnai_pos_pin_encrypted, '[updated]');
  const blank = response();
  await handler({ method: 'PATCH', body: { entity: 'foodstory', id: 1, changes: { login_identifier: 'pos@example.com', wongnai_pos_pin: '' } } }, blank);
  assert.equal(blank.statusCode, 200);
  assert.equal(records[2].wongnai_pos_pin_encrypted, undefined);
  assert.equal(audits[2].changes.wongnai_pos_pin_encrypted, undefined);
});

test('legacy FoodStory PIN edits look up the stored channel name and reject other channels', async () => {
  let storedName = 'Foodstory';
  let changed;
  const handler = loadHandler(async (url, options = {}) => {
    if (url === '/rest/v1/branch_access_channels?select=id,name&id=eq.830') return ok([{ id: 830, name: storedName }]);
    if (url === '/rest/v1/branch_access_channels?id=eq.830' && options.method === 'PATCH') { changed = JSON.parse(options.body); return ok([{ id: 830 }]); }
    if (url === '/rest/v1/branch_access_audit') return ok();
    throw new Error(`Unexpected URL ${url}`);
  });
  const res = response();
  await handler({ method: 'PATCH', body: { entity: 'channel', id: 830, changes: { wongnai_pos_pin: '0123' } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(helpers.decryptSecret(changed.wongnai_pos_pin_encrypted), '0123');
  storedName = 'Grab';
  changed = undefined;
  const denied = response();
  await handler({ method: 'PATCH', body: { entity: 'channel', id: 830, changes: { name: 'Foodstory', wongnai_pos_pin: '0123' } } }, denied);
  assert.equal(denied.statusCode, 400);
  assert.equal(changed, undefined);
});

test('API rejects malformed PIN values before database work', async () => {
  let requests = 0;
  const handler = loadHandler(async () => { requests += 1; throw new Error('Must not query'); });
  for (const pin of ['123', 'abc1', 1234, null]) {
    for (const method of ['POST', 'PATCH']) {
      const data = { wongnai_pos_pin: pin };
      const res = response();
      await handler({ method, body: { entity: 'foodstory', id: 1, values: data, changes: data } }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /4 หลัก/);
    }
  }
  assert.equal(requests, 0);
});

test('PIN reveal returns a leading-zero value for dedicated and legacy FoodStory only', async () => {
  const credentialSource = fs.readFileSync(path.join(__dirname, '../api/branch-access-credential.js'), 'utf8');
  let storedName = 'Foodstory';
  const pinEncrypted = helpers.encryptSecret('0123');
  const handler = loadHandler(async () => ok([{ name: storedName, wongnai_pos_pin_encrypted: pinEncrypted }]), false, credentialSource);
  for (const kind of ['foodstory', 'channel']) {
    const res = response();
    await handler({ method: 'POST', body: { kind, id: 1, field: 'wongnai_pos_pin' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.wongnai_pos_pin, '0123');
    assert.equal(res.body.password, undefined);
  }
  storedName = 'Grab';
  const otherChannel = response();
  await handler({ method: 'POST', body: { kind: 'channel', id: 1, field: 'wongnai_pos_pin' } }, otherChannel);
  assert.equal(otherChannel.statusCode, 400);
  const brand = response();
  await handler({ method: 'POST', body: { kind: 'brand', id: 1, field: 'wongnai_pos_pin' } }, brand);
  assert.equal(brand.statusCode, 400);
});

test('empty PIN reveal reports that it has not been set', async () => {
  const credentialSource = fs.readFileSync(path.join(__dirname, '../api/branch-access-credential.js'), 'utf8');
  const handler = loadHandler(async () => ok([{ wongnai_pos_pin_encrypted: null }]), true, credentialSource);
  const res = response();
  await handler({ method: 'POST', body: { kind: 'foodstory', id: 1, field: 'wongnai_pos_pin' } }, res);
  assert.equal(res.statusCode, 404);
  assert.match(res.body.message, /ยังไม่ได้ระบุ/);
});

test('snapshot tolerates only a missing standalone FoodStory table before migration', async () => {
  for (const code of ['PGRST205', '42P01']) {
    const isolatedHelpers = loadHelpers(async (url) => url.includes('branch_access_foodstory?')
      ? { response: { ok: false }, data: { code, message: 'Missing table' } }
      : ok());
    const snapshot = await isolatedHelpers.loadSnapshot();
    assert.equal(snapshot.foodstory.length, 0);
  }

  const deniedHelpers = loadHelpers(async (url) => url.includes('branch_access_foodstory?')
    ? { response: { ok: false }, data: { code: '42501', message: 'Permission denied' } }
    : ok());
  await assert.rejects(deniedHelpers.loadSnapshot(), /Permission denied/);
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
