const test = require('node:test');
const assert = require('node:assert/strict');
const dashboard = require('../api/internal-dashboard');

test('Kumtsu Internal exposes Card 08 as a live Cloud Kitchen system without changing other cards', () => {
  const systems = dashboard._test.systems;
  assert.equal(systems.length, 8);
  assert.deepEqual(systems.map((system) => system.id), ['01','02','03','04','05','06','07','08']);
  assert.deepEqual(systems.find((system) => system.id === '08'), {
    id: '08',
    title: 'Kumtsu & CloudKitchen',
    description: 'ระบบจัดการสาขา แบรนด์ Cloud Kitchen และเอกสารลูกค้า',
    url: '/internal/cloud-kitchen',
    status: 'live',
  });
});
