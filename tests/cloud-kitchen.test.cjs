const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cloudKitchen = require('../api/cloud-kitchen');
const seed = require('../api/_cloud-kitchen-seed.json');

test('Card 08 admin emails are normalized and restricted to the two configured accounts', () => {
  assert.equal(cloudKitchen._test.email(' Ruttapong.K@KUMTSU.COM '), 'ruttapong.k@kumtsu.com');
  assert.deepEqual([...cloudKitchen._test.ADMIN_EMAILS].sort(), ['pachara.r@kumtsu.com','ruttapong.k@kumtsu.com']);
  assert.equal(cloudKitchen._test.canManageEmail(' PACHARA.R@KUMTSU.COM '), true);
  assert.equal(cloudKitchen._test.canManageEmail('viewer@kumtsu.com'), false);
});

test('Card 08 text helper trims and limits values', () => {
  assert.equal(cloudKitchen._test.text('  Kumtsu  ', 20), 'Kumtsu');
  assert.equal(cloudKitchen._test.text('abcdef', 3), 'abc');
});

test('Card 08 adds BR051 Bangna with canonical owned-brand names and no Cloud Kitchen clients', () => {
  assert.equal(Object.keys(seed.branches).length, 51);
  assert.deepEqual(seed.branches.BR051, {
    type: 'สาขาบริษัท', staff: 0, am: 'ยังไม่ระบุ', ck: [],
    owned: ['คุ้มสึ', 'ไก่ทอดแอนโทนี', 'หมีปุ้ง หมูปิ้งโบราณ', 'โซ้ย นู้ดเดิ้ล', 'นัวนัว สุกี้แห้ง'],
    openTime: '', closeTime: '', status: 'unset', capacity: 0,
  });
  const html = fs.readFileSync(path.join(__dirname, '../internal/cloud-kitchen.html'), 'utf8');
  assert.match(html, /<div class="total"><b>51<\/b> สาขา<\/div>/);
  assert.match(html, /code:'BR051',name:'คุ้มสึ บางนา'/);
  assert.match(html, /phone:'0942054676',lat:13\.66572,lng:100\.6424/);
});

test('Card 08 seed repair inserts only missing branches without overwriting existing rows', () => {
  const rows = cloudKitchen._test.missingBranchRows([{ branch_code: 'BR001' }, { branch_code: 'BR051' }], 'admin@kumtsu.com');
  assert.equal(rows.length, 49);
  assert.equal(rows.some((row) => row.branch_code === 'BR001'), false);
  assert.equal(rows.some((row) => row.branch_code === 'BR051'), false);
  assert.equal(rows.every((row) => row.updated_by_email === 'admin@kumtsu.com'), true);
});

test('Card 08 accepts only supported document categories and valid PDFs up to 3 MB', () => {
  assert.equal(cloudKitchen._test.documentType('contract'), 'contract');
  assert.equal(cloudKitchen._test.documentType('payment'), 'payment');
  assert.equal(cloudKitchen._test.documentType('other'), 'other');
  assert.equal(cloudKitchen._test.documentType('invoice'), '');
  const valid = cloudKitchen._test.fileBytes({ type:'application/pdf', base64:Buffer.from('%PDF-1.7\nfile').toString('base64') }, new Set(['application/pdf']));
  assert.equal(valid.type, 'application/pdf');
  assert.throws(() => cloudKitchen._test.fileBytes({ type:'application/pdf', base64:Buffer.from('not-pdf').toString('base64') }, new Set(['application/pdf'])), /PDF/);
});

test('Card 08 document list remains unlimited and supports search plus type filtering', () => {
  const documents = Array.from({ length:75 }, (_, index) => ({
    document_name:index === 64 ? 'สัญญาพิเศษ' : `เอกสาร ${index}`,
    original_filename:index === 64 ? 'special-contract.pdf' : `file-${index}.pdf`,
    document_type:index % 2 ? 'payment' : 'contract',
  }));
  assert.equal(cloudKitchen._test.filterDocuments(documents).length, 75);
  assert.equal(cloudKitchen._test.filterDocuments(documents, 'special-contract').length, 1);
  assert.equal(cloudKitchen._test.filterDocuments(documents, '', 'payment').length, 37);
  assert.equal(cloudKitchen._test.filterDocuments(documents, 'สัญญาพิเศษ', 'contract').length, 1);
});

test('Card 08 schema safely migrates legacy files and protects the unlimited document table', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../database/cloud-kitchen.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.cloud_kitchen_documents/);
  assert.match(sql, /on conflict \(object_path\) do nothing/g);
  assert.match(sql, /alter table public\.cloud_kitchen_documents enable row level security/);
  assert.match(sql, /revoke all on table[\s\S]*public\.cloud_kitchen_documents from anon, authenticated/);
  assert.match(sql, /cloud_kitchen_documents_client_created_idx/);
});

test('Card 08 client UI exposes document search, type filter, open, upload, and admin-only deletion controls', () => {
  const script = fs.readFileSync(path.join(__dirname, '../internal/cloud-kitchen.js'), 'utf8');
  assert.match(script, /id="documentSearch"/);
  assert.match(script, /id="documentTypeFilter"/);
  assert.match(script, /id="documentUploadForm"/);
  assert.match(script, /action:'delete-document'/);
  assert.match(script, /canManage \? `<button class="danger document-delete"/);
});

test('Kumtsu Internal dashboard keeps Card 08 live and linked to Cloud Kitchen', () => {
  const dashboardApi = fs.readFileSync(path.join(__dirname, '../api/internal-dashboard.js'), 'utf8');
  assert.match(dashboardApi, /id: '08'/);
  assert.match(dashboardApi, /title: 'Kumtsu & CloudKitchen'/);
  assert.match(dashboardApi, /url: '\/internal\/cloud-kitchen'/);
  assert.match(dashboardApi, /status: 'live'/);
});
