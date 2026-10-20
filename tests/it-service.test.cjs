const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { _test } = require('../api/it-service');

async function inventoryRequest(body, method = 'POST', duplicate = false) {
  let saved;
  const auth = {
    currentUser: async () => ({ user: { id: 'test-user', email: 'pachara.r@kumtsu.com' } }),
    readJson: async req => req.body,
    send: (res, status, data) => Object.assign(res, { status, data }),
    serviceSupabase: async (path, options = {}) => {
      if (path.includes('internal_profiles')) return { response: { ok: true }, data: [{ status: 'active', email: 'pachara.r@kumtsu.com' }] };
      saved = JSON.parse(options.body);
      return duplicate ? { response: { ok: false }, data: { code: '23505', message: 'duplicate key' } } : { response: { ok: true }, data: [saved] };
    },
  };
  const context = vm.createContext({ module: { exports: {} }, require: () => auth, console });
  vm.runInContext(fs.readFileSync(require.resolve('../api/it-service'), 'utf8'), context);
  const res = { setHeader() {} };
  await context.module.exports({ method, body }, res);
  return { ...res, saved };
}

const inventoryBody = { action: 'add-inventory', equipmentType: 'มือถือ', brand: 'Samsung', model: 'A06', quantity: 1, branch: 'สำนักงานใหญ่', storageLocation: '', isInStock: true };

test('warehouse inventory can be added without an assigned holder', async () => {
  const result = await inventoryRequest(inventoryBody);
  assert.equal(result.status, 201);
  assert.equal(result.saved[0].storage_location, 'อยู่ในคลัง');
  assert.equal(result.saved[0].is_in_stock, true);
});

test('assigned equipment still requires a holder', async () => {
  const result = await inventoryRequest({ ...inventoryBody, isInStock: false });
  assert.equal(result.status, 400);
  assert.equal(result.saved, undefined);
});

test('warehouse equipment can be edited without an assigned holder', async () => {
  const result = await inventoryRequest({ ...inventoryBody, action: 'edit-inventory', id: 1 }, 'PATCH');
  assert.equal(result.status, 200);
  assert.equal(result.saved.storage_location, 'อยู่ในคลัง');
});

test('duplicate serial numbers return an actionable conflict instead of service unavailable', async () => {
  const result = await inventoryRequest(inventoryBody, 'POST', true);
  assert.equal(result.status, 409);
  assert.match(result.data.message, /มีอยู่แล้ว/);
});

test('Card 07 allows the requested positions and equipment types', () => {
  assert.equal(_test.POSITIONS.has('พนักงานหน้าสาขา'), true);
  assert.equal(_test.POSITIONS.has('Owner'), true);
  assert.equal(_test.EQUIPMENT_TYPES.has('CCTV'), true);
  assert.equal(_test.EQUIPMENT_TYPES.has('จอคอมพิวเตอร์'), true);
  assert.equal(_test.EQUIPMENT_TYPES.has('เครื่องปริ้น Inkjet'), true);
});

test('Card 07 normalizes email and bounds text', () => {
  assert.equal(_test.email(' Pachara.R@KUMTSU.COM '), 'pachara.r@kumtsu.com');
  assert.equal(_test.text('abcdef', 3), 'abc');
});

test('Card 07 loads the company asset number for inventory records', () => {
  assert.match(_test.ITEM_SELECT, /asset_number/);
});

test('Card 07 loads stock-transfer destination details', () => {
  assert.match(_test.ISSUE_SELECT, /destination_inventory_item_id/);
  assert.match(_test.ISSUE_SELECT, /source_branch/);
  assert.match(_test.ISSUE_SELECT, /source_storage_location/);
});

test('a stalled Card 07 request times out and aborts rather than hanging', async () => {
  const source = fs.readFileSync(require.resolve('../internal/it-service.js'), 'utf8');
  let timeout;
  let signal;
  const context = vm.createContext({ AbortController, api: async (_path, options) => { signal = options.signal; return new Promise(() => {}); }, setTimeout: fn => { timeout = fn; return 1; }, clearTimeout() {} });
  vm.runInContext(source.split('\n').find(line => line.startsWith('async function boundedApi')), context);
  const pending = context.boundedApi('/api/it-service');
  const rejected = assert.rejects(pending, /ยังยืนยันการบันทึกไม่ได้/);
  timeout();
  await rejected;
  assert.equal(signal.aborted, true);
});

test('a confirmed save is not reported as failed when refreshing the list fails', async () => {
  const source = fs.readFileSync(require.resolve('../internal/it-service.js'), 'utf8');
  const toasts = [];
  const context = vm.createContext({ boundedApi: async () => ({ response: { ok: true }, data: { message: 'saved', items: [{ id: 1 }] } }), load: async () => { throw new Error('offline'); }, showToast: message => toasts.push(message) });
  vm.runInContext(source.split('\n').find(line => line.startsWith('const request=')) + '\nthis.runRequest=request;', context);
  const data = await context.runRequest('POST', { action: 'add-inventory' });
  assert.equal(data.items[0].id, 1);
  assert.match(toasts[0], /บันทึกสำเร็จแล้ว/);
});
