const crypto = require('crypto');
const { currentUser, readJson, send, serviceSupabase } = require('../_internal-auth');

function clean(value, max = 160) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function validEmail(value) { return /^[^\s@]+@kumtsu\.com$/i.test(value); }
function temporaryPassword() { return `${crypto.randomBytes(24).toString('base64url')}Aa1!`; }

async function requireAdmin(req, res) {
  const auth = await currentUser(req);
  if (!auth) { send(res, 401, { message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }); return null; }
  const { response, data } = await serviceSupabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=email,status`);
  const profile = response.ok ? data?.[0] : null;
  if (!profile || profile.status !== 'active' || String(profile.email || '').trim().toLowerCase() !== 'pachara.r@kumtsu.com') {
    send(res, 403, { message: 'ไม่มีสิทธิ์เข้าถึงระบบผู้ดูแล' });
    return null;
  }
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
