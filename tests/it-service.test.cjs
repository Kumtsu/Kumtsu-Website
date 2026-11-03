const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { _test } = require('../api/it-service');

async function inventoryRequest(body, method = 'POST', duplicate = false, configuration = {}) {
  let saved;
  const calls = [];
  const actor = configuration.actor || 'pachara.r@kumtsu.com';
  const auth = {
    currentUser: async () => ({ user: { id: 'test-user', email: actor } }),
    readJson: async req => req.body,
    send: (res, status, data) => Object.assign(res, { status, data }),
    serviceSupabase: async (path, options = {}) => {
      if (path.includes('internal_profiles')) return { response: { ok: true }, data: [{ status: 'active', email: actor }] };
      saved = JSON.parse(options.body);
      calls.push({ path, method: options.method, body: saved });
      if (path.endsWith('/rpc/issue_it_inventory_batch')) return { response: { ok: true }, data: { job: { id: saved.p_job_id, ...(saved.p_job_patch || {}) }, issues: saved.p_items.map((item, index) => ({ id: index + 1, job_id: saved.p_job_id, ...item })) } };
      if (path.endsWith('/rpc/issue_it_inventory')) return { response: { ok: true }, data: { id: 1, job_id: saved.p_job_id, inventory_item_id: saved.p_inventory_item_id, quantity: saved.p_quantity } };
      return duplicate ? { response: { ok: false }, data: { code: '23505', message: 'duplicate key' } } : { response: { ok: true }, data: [saved] };
    },
  };
  const context = vm.createContext({ module: { exports: {} }, require: () => auth, console });
  vm.runInContext(fs.readFileSync(require.resolve('../api/it-service'), 'utf8'), context);
  const res = { setHeader() {} };
  await context.module.exports({ method, body }, res);
  return { ...res, saved, calls };
}

const inventoryBody = { action: 'add-inventory', equipmentType: 'มือถือ', brand: 'Samsung', model: 'A06', quantity: 1, branch: 'สำนักงานใหญ่', storageLocation: '', isInStock: true };

const jobUpdateBody = { action: 'update-job', id: 7, requestDate: '2026-11-03', position: 'IT', branch: 'สาขาใหม่', issueType: 'Notebook', description: 'ส่งอุปกรณ์หลายรายการ', status: 'completed', assignedTo: ['pachara.r@kumtsu.com'], scheduledDate: '2026-11-04' };

test('multiple equipment items are issued through a single atomic batch RPC', async () => {
  const result = await inventoryRequest({ action: 'issue-stock', jobId: 7, items: [{ inventoryItemId: 4, quantity: 1 }, { inventoryItemId: 9, quantity: 2 }] });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].path, '/rest/v1/rpc/issue_it_inventory_batch');
  assert.deepEqual(result.saved.p_items, [{ inventory_item_id: 4, quantity: 1 }, { inventory_item_id: 9, quantity: 2 }]);
  assert.equal(result.saved.p_job_id, 7);
  assert.equal(result.saved.p_actor_email, 'pachara.r@kumtsu.com');
  assert.equal(result.data.issues.length, 2);
});

test('duplicate equipment selections are combined before the atomic batch RPC', async () => {
  const result = await inventoryRequest({ action: 'issue-stock', jobId: 7, items: [{ inventoryItemId: 4, quantity: 1 }, { inventoryItemId: 9, quantity: 2 }, { inventoryItemId: 4, quantity: 3 }] });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.saved.p_items, [{ inventory_item_id: 4, quantity: 4 }, { inventory_item_id: 9, quantity: 2 }]);
});

test('legacy single-equipment issue requests retain their original RPC', async () => {
  const result = await inventoryRequest({ action: 'issue-stock', jobId: 7, inventoryItemId: 4, quantity: 2 });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].path, '/rest/v1/rpc/issue_it_inventory');
  assert.deepEqual(result.saved, { p_job_id: 7, p_inventory_item_id: 4, p_quantity: 2, p_actor_email: 'pachara.r@kumtsu.com' });
});

test('invalid batch equipment payloads are rejected before any stock is changed', async () => {
  for (const items of [[], null, {}, [null], [{}], [{ inventoryItemId: 0, quantity: 1 }], [{ inventoryItemId: -1, quantity: 1 }], [{ inventoryItemId: 1.5, quantity: 1 }], [{ inventoryItemId: 1, quantity: 0 }], [{ inventoryItemId: 1, quantity: -1 }], [{ inventoryItemId: 1, quantity: 1.5 }], [{ inventoryItemId: 1, quantity: Number.MAX_SAFE_INTEGER + 1 }], Array.from({ length: 101 }, () => ({ inventoryItemId: 1, quantity: 1 }))]) {
    const result = await inventoryRequest({ action: 'issue-stock', jobId: 7, items });
    assert.equal(result.status, 400, JSON.stringify(items));
    assert.equal(result.calls.length, 0, 'invalid data must not reach the database');
  }
});

test('the batch normalizer bounds inputs and rejects combined quantity overflow', () => {
  assert.deepEqual(_test.normalizeIssueItems([{ inventoryItemId: 4, quantity: 1 }, { inventoryItemId: 4, quantity: 2 }]), [{ inventoryItemId: 4, quantity: 3 }]);
  const atLimit = _test.normalizeIssueItems(Array.from({ length: 100 }, () => ({ inventoryItemId: 1, quantity: 1 })));
  assert.deepEqual(atLimit, [{ inventoryItemId: 1, quantity: 100 }]);
  for (const items of [[], [{ inventoryItemId: 1, quantity: 2147483647 }, { inventoryItemId: 1, quantity: 1 }]]) {
    assert.throws(() => _test.normalizeIssueItems(items), error => error.statusCode === 400);
  }
});

test('closing a job with multiple items sends the changed job fields and items atomically', async () => {
  const result = await inventoryRequest({ ...jobUpdateBody, inventoryItems: [{ inventoryItemId: 4, quantity: 1 }, { inventoryItemId: 9, quantity: 2 }] }, 'PATCH');
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1, 'job update and stock transfer must share a single RPC');
  assert.equal(result.calls[0].path, '/rest/v1/rpc/issue_it_inventory_batch');
  assert.equal(result.saved.p_job_id, 7);
  assert.deepEqual(result.saved.p_items, [{ inventory_item_id: 4, quantity: 1 }, { inventory_item_id: 9, quantity: 2 }]);
  assert.equal(result.saved.p_job_patch.branch, 'สาขาใหม่');
  assert.equal(result.saved.p_job_patch.position, 'IT');
  assert.equal(result.saved.p_job_patch.status, 'completed');
  assert.equal(result.saved.p_job_patch.request_date, '2026-11-03');
  assert.deepEqual(result.saved.p_job_patch.assigned_to, ['pachara.r@kumtsu.com']);
  assert.equal(result.data.job.branch, 'สาขาใหม่');
  assert.equal(result.data.issues.length, 2);
});

test('invalid job fields or empty closing batches cannot cause a stock transfer', async () => {
  for (const body of [{ ...jobUpdateBody, description: '', inventoryItems: [{ inventoryItemId: 4, quantity: 1 }] }, { ...jobUpdateBody, inventoryItems: [] }, { ...jobUpdateBody, inventoryItems: [{ inventoryItemId: 4, quantity: 0 }] }]) {
    const result = await inventoryRequest(body, 'PATCH');
    assert.equal(result.status, 400);
    assert.equal(result.calls.length, 0);
  }
});

test('only IT managers may issue batches or close jobs with equipment', async () => {
  for (const [body, method] of [[{ action: 'issue-stock', jobId: 7, items: [{ inventoryItemId: 4, quantity: 1 }] }, 'POST'], [{ ...jobUpdateBody, inventoryItems: [{ inventoryItemId: 4, quantity: 1 }] }, 'PATCH']]) {
    const result = await inventoryRequest(body, method, false, { actor: 'employee@kumtsu.com' });
    assert.equal(result.status, 403);
    assert.equal(result.calls.length, 0);
  }
});

function assetNumberContext() {
  const source = fs.readFileSync(require.resolve('../internal/it-service.js'), 'utf8');
  const nodes = { inventoryId: { value: '' }, inventoryAssetNumber: { value: '' }, inventoryQuantity: { value: '1' } };
  const context = vm.createContext({ Intl, Date, $: id => nodes[id], state: { items: [] } });
  vm.runInContext(source.slice(source.indexOf('function suggestAssetNumbers('), source.indexOf('function syncInventoryStorage(')), context);
  return { context, nodes };
}

test('asset suggestions use Bangkok day/month/Gregorian year and daily sequences', () => {
  const { context } = assetNumberContext();
  const day = new Date('2026-11-02T00:00:00+07:00');
  assert.equal(context.suggestAssetNumbers([], 1, day), 'ks-02112026-001');
  const items = [{ asset_number: 'KS-25-01-000021' }, { asset_number: '02112026-003' }, { asset_number: '01112026-999' }];
  const snapshot = JSON.stringify(items);
  assert.equal(context.suggestAssetNumbers(items, 2, day), 'ks-02112026-004, ks-02112026-005');
  assert.equal(context.suggestAssetNumbers(items, 1, new Date('2026-11-02T17:00:00Z')), 'ks-03112026-001');
  assert.equal(context.suggestAssetNumbers([...items, { asset_number: 'ks-02112026-007' }, { asset_number: 'KS-02112026-009' }], 1, day), 'ks-02112026-010');
  assert.equal(JSON.stringify(items), snapshot);
});

test('asset suggestions preserve manual edits, empty values, and existing record codes', () => {
  const { context, nodes } = assetNumberContext();
  nodes.inventoryAssetNumber.value = 'MY-CODE';
  vm.runInContext('automaticAssetNumbers=false;updateSuggestedAssetNumbers()', context);
  assert.equal(nodes.inventoryAssetNumber.value, 'MY-CODE');
  nodes.inventoryAssetNumber.value = '';
  vm.runInContext('updateSuggestedAssetNumbers()', context);
  assert.equal(nodes.inventoryAssetNumber.value, '');
  nodes.inventoryId.value = '1';
  nodes.inventoryAssetNumber.value = 'KS-25-01-000021';
  vm.runInContext('automaticAssetNumbers=true;updateSuggestedAssetNumbers()', context);
  assert.equal(nodes.inventoryAssetNumber.value, 'KS-25-01-000021');
});

test('inventory saves manually edited codes or no code exactly as submitted', async () => {
  const edited = await inventoryRequest({ ...inventoryBody, assetNumbers: ['MY-CODE'] });
  assert.equal(edited.saved[0].asset_number, 'MY-CODE');
  const cleared = await inventoryRequest({ ...inventoryBody, assetNumbers: [] });
  assert.equal(cleared.saved[0].asset_number, null);
});

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

test('equipment holder positions can be saved and edited without changing the holder', async () => {
  const added = await inventoryRequest({ ...inventoryBody, storageLocation: 'ผู้ครอบครองเดิม', holderPosition: 'AM' });
  assert.equal(added.status, 201);
  assert.equal(added.saved[0].holder_position, 'AM');
  assert.equal(added.saved[0].storage_location, 'ผู้ครอบครองเดิม');
  const edited = await inventoryRequest({ ...inventoryBody, action: 'edit-inventory', id: 1, storageLocation: 'ผู้ครอบครองเดิม', holderPosition: 'IT' }, 'PATCH');
  assert.equal(edited.status, 200);
  assert.equal(edited.saved.holder_position, 'IT');
  assert.equal(edited.saved.storage_location, 'ผู้ครอบครองเดิม');
});

test('holder position is optional for existing records and rejects unknown positions', async () => {
  const legacy = await inventoryRequest(inventoryBody);
  assert.equal(legacy.status, 201);
  assert.equal(legacy.saved[0].holder_position, '');
  const invalid = await inventoryRequest({ ...inventoryBody, holderPosition: 'invalid' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.saved, undefined);
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
