const { currentUser, readJson, send, supabase } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'ลิงก์หมดอายุหรือไม่ถูกต้อง' });
    const { password = '' } = await readJson(req);
    if (String(password).length < 10) return send(res, 400, { message: 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร' });
    const { response } = await supabase('/auth/v1/user', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) return send(res, 400, { message: 'ไม่สามารถเปลี่ยนรหัสผ่านได้' });
    return send(res, 200, { message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
  } catch (_) {
    return send(res, 503, { message: 'ระบบขัดข้องชั่วคราว' });
  }
};
