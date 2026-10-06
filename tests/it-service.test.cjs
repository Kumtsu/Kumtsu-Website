const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../api/it-service');

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
