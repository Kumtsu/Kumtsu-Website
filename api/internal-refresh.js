const { readJson, send, supabase } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const { refreshToken = '' } = await readJson(req);
    if (!refreshToken) return send(res, 401, { message: 'Session expired' });
    const { response, data } = await supabase('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return response.ok ? send(res, 200, data) : send(res, 401, { message: 'Session expired' });
  } catch (_) { return send(res, 503, { message: 'ไม่สามารถต่ออายุการเข้าสู่ระบบได้' }); }
};
