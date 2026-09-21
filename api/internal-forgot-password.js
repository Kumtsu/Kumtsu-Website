const { readJson, send, supabase } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const { email = '' } = await readJson(req);
    const normalized = String(email).trim().toLowerCase();
    if (!normalized.endsWith('@kumtsu.com')) return send(res, 400, { message: 'กรุณาใช้อีเมล @kumtsu.com' });
    const origin = process.env.PUBLIC_SITE_URL || 'https://www.kumtsu.com';
    const redirectTo = `${origin.replace(/\/$/, '')}/internal/reset-password.html`;
    await supabase(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    });
    return send(res, 200, { message: 'หากอีเมลนี้มีบัญชี ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว' });
  } catch (_) {
    return send(res, 503, { message: 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่ภายหลัง' });
  }
};
