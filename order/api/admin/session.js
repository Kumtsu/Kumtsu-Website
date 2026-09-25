const { ADMIN_EMAILS, callSupabase, readJson, send } = require('../_lib');

async function validate(data) {
  const email = String(data.user?.email || '').trim().toLowerCase();
  if (!ADMIN_EMAILS.has(email)) return { ok: false, status: 403, message: 'บัญชีนี้ไม่มีสิทธิ์เข้าดูออเดอร์' };
  const profile = await callSupabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(data.user.id)}&select=status`, {}, true);
  if (!profile.response.ok || profile.data?.[0]?.status !== 'active') return { ok: false, status: 403, message: 'บัญชีนี้ยังไม่พร้อมใช้งาน' };
  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (!['POST', 'PUT'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });
  try {
    const body = await readJson(req);
    let result;
    if (req.method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!ADMIN_EMAILS.has(email) || !body.password) return send(res, 401, { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
      result = await callSupabase('/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: body.password }),
      });
    } else {
      if (!body.refreshToken) return send(res, 401, { message: 'เซสชันหมดอายุ' });
      result = await callSupabase('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: body.refreshToken }),
      });
    }
    if (!result.response.ok) return send(res, 401, { message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    const allowed = await validate(result.data);
    if (!allowed.ok) return send(res, allowed.status, { message: allowed.message });
    return send(res, 200, result.data);
  } catch (_) {
    return send(res, 503, { message: 'ไม่สามารถเชื่อมต่อระบบสมาชิกได้' });
  }
};
