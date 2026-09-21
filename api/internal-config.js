const { env, send } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { message: 'Method not allowed' });
  try {
    const { url, key } = env();
    return send(res, 200, { supabaseUrl: url, publishableKey: key, bucket: 'internal-profiles' });
  } catch (_) {
    return send(res, 503, { message: 'ระบบสมาชิกยังไม่ได้ตั้งค่า' });
  }
};
