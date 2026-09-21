const crypto = require('crypto');
const { adminUser, readJson, send, serviceSupabase } = require('../_internal-auth');

function clean(value, max = 160) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function validEmail(value) { return /^[^\s@]+@kumtsu\.com$/i.test(value); }
function temporaryPassword() { return `${crypto.randomBytes(24).toString('base64url')}Aa1!`; }

async function requireAdmin(req, res) {
  const auth = await adminUser(req);
  if (!auth) { send(res, 403, { message: 'ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล' }); return null; }
  return auth;
}

async function sendEmail(payload, key) {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'RESEND_API_KEY missing' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, data: await response.json().catch(() => ({})) };
}

module.exports = { clean, readJson, requireAdmin, send, sendEmail, serviceSupabase, temporaryPassword, validEmail };
