const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('Kumtsu ALL installation starts inside the authenticated internal area', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'internal/manifest.webmanifest')));
  assert.equal(manifest.name, 'Kumtsu ALL');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/internal/dashboard.html');
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)));
});

test('worker caches only public assets and never handles API or sensitive subresources', async () => {
  const handlers = {};
  let cached;
  const offline = { offline: true };
  const context = {
    URL,
    self: { location: { origin: 'https://www.kumtsu.com' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { open: async () => ({ addAll: async assets => { cached = assets; } }), match: async () => offline },
    fetch: async () => { throw new Error('offline'); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'internal/sw.js'), 'utf8'), context);
  let installing;
  handlers.install({ waitUntil: promise => { installing = promise; } });
  await installing;
  assert.equal(cached.length, 4);
  assert.ok(cached.every(asset => asset.startsWith('/internal/pwa/')));
  for (const [url, method] of [['/api/internal-dashboard', 'GET'], ['/api/internal-login', 'POST'], ['/internal/profile.js', 'GET']]) {
    let intercepted = false;
    handlers.fetch({ request: { url: `https://www.kumtsu.com${url}`, method }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
  let navigation;
  handlers.fetch({ request: { url: 'https://www.kumtsu.com/internal/profile.html', method: 'GET', mode: 'navigate' }, respondWith: promise => { navigation = promise; } });
  assert.equal(await navigation, offline);
});
