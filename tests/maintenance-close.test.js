const assert = require('node:assert/strict');
const test = require('node:test');

const { _test } = require('../api/maintenance-close');

test('normalizes actor email and sanitizes uploaded filenames', () => {
  assert.equal(_test.email(' Tech@KUMTSU.COM '), 'tech@kumtsu.com');
  assert.equal(_test.safeName('../../หลักฐาน งาน.JPG'), 'JPG');
  assert.ok(_test.safeName('a'.repeat(200)).length <= 80);
});

test('accepts only image content matching the declared MIME type', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from('RIFF0000WEBP', 'ascii');

  assert.equal(_test.hasImageSignature(jpeg, 'image/jpeg'), true);
  assert.equal(_test.hasImageSignature(png, 'image/png'), true);
  assert.equal(_test.hasImageSignature(webp, 'image/webp'), true);
  assert.equal(_test.hasImageSignature(Buffer.from('not an image'), 'image/png'), false);
  assert.equal(_test.hasImageSignature(png, 'image/jpeg'), false);
});
