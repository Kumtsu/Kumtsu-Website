const assert = require('node:assert/strict');
const test = require('node:test');

process.env.BRANCH_ACCESS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const { ADMIN_EMAIL, cleanCreate, cleanChanges, decryptSecret, encryptSecret, normalizedEmail } = require('../api/_branch-access');

test('encrypts and decrypts credentials without storing plaintext', () => {
  const plaintext = 'Secret-1234';
  const encrypted = encryptSecret(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptSecret(encrypted), plaintext);
});

test('normalizes the one designated admin email', () => {
  assert.equal(normalizedEmail(' Pachara.R@KUMTSU.COM '), ADMIN_EMAIL);
  assert.notEqual(normalizedEmail('another@kumtsu.com'), ADMIN_EMAIL);
});

test('only accepts fields allowed for each entity', () => {
  const changes = cleanChanges('branch', { name: 'สาขาทดสอบ', password: 'nope', unknown: 'nope' });
  assert.equal(changes.name, 'สาขาทดสอบ');
  assert.equal(changes.password, undefined);
  assert.equal(changes.unknown, undefined);
  assert.ok(changes.updated_at);
});

test('validates and encrypts new branch and brand records', () => {
  const branch = cleanCreate('branch', { code: 'BR051', name: 'สาขาทดสอบ', unknown: 'nope' });
  assert.equal(branch.code, 'BR051');
  assert.equal(branch.name, 'สาขาทดสอบ');
  assert.equal(branch.unknown, undefined);

  const brand = cleanCreate('brand', { branch_id: 51, name: 'คุ้มสึ', code: 'TEST051', login_identifier: 'test@kumtsu.com', password: 'Secret-1234' }, { branchCode: 'BR051' });
  assert.equal(brand.branch_id, 51);
  assert.equal(brand.code, 'KS051');
  assert.equal(decryptSecret(brand.password_encrypted), 'Secret-1234');
  assert.equal(brand.password, undefined);
  assert.equal(cleanCreate('brand', { branch_id: 51, name: 'ขาดรหัส', code: 'NO-PASS' }), null);
});

test('only creates catalog channels with a parent brand and encrypted credentials', () => {
  const channel = cleanCreate('channel', { brand_id: 208, name: 'Grab', login_identifier: 'sample@kumtsu.com', password: 'Channel-1234', unknown: 'ignored' });
  assert.equal(channel.brand_id, 208);
  assert.equal(channel.name, 'Grab');
  assert.equal(channel.unknown, undefined);
  assert.equal(channel.password, undefined);
  assert.equal(decryptSecret(channel.password_encrypted), 'Channel-1234');
  assert.equal(cleanCreate('channel', { brand_id: 208, name: 'Unknown', login_identifier: 'sample', password: 'secret' }), null);
  assert.equal(cleanCreate('channel', { brand_id: -1, name: 'Grab', login_identifier: 'sample', password: 'secret' }), null);
});

test('new brands require a known name and the parent branch code', () => {
  const values = { branch_id: 51, name: 'คุ้มสึ', login_identifier: 'sample', password: 'secret' };
  assert.equal(cleanCreate('brand', values), null);
  assert.equal(cleanCreate('brand', { ...values, name: 'unknown' }, { branchCode: 'BR051' }), null);
});
