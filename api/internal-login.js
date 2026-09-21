const { readJson, send, supabase } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const { email = '', password = '' } = await readJson(req);
    const normalized = String(email).trim().toLowerCase();
    if (!normalized.endsWith('@kumtsu.com') || !password) {
      return send(res, 400, { message: 'กรุณากรอกอีเมล @kumtsu.com และรหัสผ่าน' });
    }
    const { response, data } = await supabase('/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, password }),
    });
    if (!response.ok) return send(res, 401, { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    return send(res, 200, data);
  } catch (_) {
    return send(res, 503, { message: 'ไม่สามารถเชื่อมต่อระบบสมาชิกได้' });
  }
};
