const { currentUser, readJson, send, supabase } = require('./_internal-auth');

const fields = 'user_id,employee_id,first_name,last_name,department,email,internal_phone,avatar_path,updated_at';

module.exports = async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบใหม่' });
    const path = `/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=${fields}`;
    if (req.method === 'GET') {
      const { response, data } = await supabase(path, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' } });
      if (!response.ok || !data[0]) return send(res, 404, { message: 'ไม่พบโปรไฟล์พนักงาน กรุณาติดต่อฝ่าย IT' });
      return send(res, 200, { user: auth.user, profile: data[0] });
    }
    const body = await readJson(req);
    const update = {
      first_name: String(body.firstName || '').trim().slice(0, 80),
      last_name: String(body.lastName || '').trim().slice(0, 80),
      department: String(body.department || '').trim().slice(0, 100),
      internal_phone: String(body.internalPhone || '').trim().slice(0, 30),
      avatar_path: body.avatarPath ? String(body.avatarPath).slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    };
    if (!update.first_name || !update.last_name || !update.department) return send(res, 400, { message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ' });
    const { response, data } = await supabase(path, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(update),
    });
    if (!response.ok) return send(res, 400, { message: 'ไม่สามารถบันทึกโปรไฟล์ได้' });
    return send(res, 200, { message: 'อัปเดตโปรไฟล์สำเร็จ', profile: data[0] });
  } catch (_) {
    return send(res, 503, { message: 'ระบบขัดข้องชั่วคราว' });
  }
};
