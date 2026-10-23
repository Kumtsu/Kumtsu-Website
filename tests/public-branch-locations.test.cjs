const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { publicLocations } = require('../scripts/public-branch-locations.cjs');
const locations = require('../branch-locations.js');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('public addresses and pins match the complete Cloud Kitchen location list, including corrections', () => {
  assert.deepEqual(locations, publicLocations(read('internal/cloud-kitchen.html')));
  assert.equal(locations.length, 51);
  const branch = code => locations.find(item => item.code === code);
  assert.equal(branch('BR003').lat, 13.71019774810776);
  assert.match(branch('BR003').address, /200\/55/);
  assert.equal(branch('BR019').lat, 13.92668);
  assert.match(branch('BR019').address, /310\/970/);
  assert.equal(branch('BR026').lat, 14.065726);
  assert.match(branch('BR026').address, /69\/9/);
  assert.match(branch('BR051').name, /บางนา/);
  assert.equal(branch('BR038').name, 'สายลม');
});

test('only public location fields are exported, with unique branch codes and valid coordinates', () => {
  const seen = new Set();
  for (const branch of locations) {
    assert.deepEqual(Object.keys(branch).sort(), ['address', 'code', 'lat', 'lng', 'name']);
    assert.ok(!seen.has(branch.code));
    assert.ok(Number.isFinite(branch.lat) && Math.abs(branch.lat) <= 90);
    assert.ok(Number.isFinite(branch.lng) && Math.abs(branch.lng) <= 180);
    seen.add(branch.code);
  }
});

test('every public branch card and navigation link uses that branch location rather than a name search', () => {
  const html = read('index.html');
  assert.match(html, /51 สาขา/);
  for (const branch of locations) {
    assert.ok(html.includes(`data-branch-code="${branch.code}"`));
    assert.ok(html.includes(`destination=${branch.lat},${branch.lng}`));
    assert.ok(html.includes(branch.address));
  }
  assert.equal((html.match(/data-branch-code=/g) || []).length, locations.length);
  assert.match(html, /id="branchMap" src="\.\/branch-map.html"/);
  assert.doesNotMatch(read('script.js'), /branchCoordinates|maps\?q=/);
});

test('extraction does not export internal data and fails rather than publishing invalid coordinates', () => {
  const source = 'const branches=[{"code":"BR001","name":"test","address":"address","lat":13,"lng":100,"phone":"private","staff":5,"am":"private"}];';
  assert.deepEqual(publicLocations(source), [{ code: 'BR001', name: 'test', address: 'address', lat: 13, lng: 100 }]);
  assert.throws(() => publicLocations(source.replace('"lat":13', '"lat":999')), /Incomplete branch/);
});
