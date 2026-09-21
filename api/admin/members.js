const { clean, readJson, requireAdmin, send, serviceSupabase, temporaryPassword, validEmail } = require('./_admin-utils');

function normalizeProfile(row) {
  return { id: row.user_id, kind: 'profile', firstName: row.first_name, lastName: row.last_name, employeeId: row.employee_id, department: row.department, email: row.email, phone: row.internal_phone || '', avatarPath: row.avatar_path, status: row.status, createdAt: row.created_at };
}
function normalizeRequest(row) {
  return { id: row.id, kind: 'request', firstName: row.first_name, lastName: row.last_name, employeeId: row.employee_id, department: row.department, email: row.email, phone: row.phone || '', avatarPath: null, status: row.status === 'approved' ? 'active' : row.status, createdAt: row.created_at, notificationStatus: row.notification_status };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const admin = await requireAdmin(req, res); if (!admin) return;
  try {
    if (req.method === 'GET') {
      const [profilesResult, requestsResult] = await Promise.all([
        serviceSupabase('/rest/v1/internal_profiles?select=*&order=created_at.desc'),
        serviceSupabase('/rest/v1/internal_member_requests?select=*&status=neq.approved&order=created_at.desc'),
      ]);
      if (!profilesResult.response.ok || !requestsResult.response.ok) return send(res, 502, { message: 'โหลดรายชื่อสมาชิกไม่สำเร็จ' });
      return send(res, 200, { members: [...requestsResult.data.map(normalizeRequest), ...profilesResult.data.map(normalizeProfile)] });
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const member = { firstName: clean(body.firstName,80), lastName: clean(body.lastName,80), employeeId: clean(body.employeeId,30), department: clean(body.department,100), email: clean(body.email,160).toLowerCase(), phone: clean(body.phone,30), password: String(body.password || '') };
      if (!member.firstName || !member.lastName || !member.employeeId || !member.department || !validEmail(member.email)) return send(res, 400, { message: 'กรุณากรอกข้อมูลสมาชิกให้ครบและใช้อีเมล @kumtsu.com' });
      const password = member.password.length >= 10 ? member.password : temporaryPassword();
      const authResult = await serviceSupabase('/auth/v1/admin/users', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: member.email, password, email_confirm: true }) });
      if (!authResult.response.ok) return send(res, 400, { message: authResult.data.msg || authResult.data.message || 'สร้างบัญชีสมาชิกไม่สำเร็จ' });
      const profileResult = await serviceSupabase('/rest/v1/internal_profiles', { method: 'POST', headers: { 'Content-Type':'application/json', Prefer:'return=representation' }, body: JSON.stringify({ user_id: authResult.data.id, employee_id: member.employeeId, first_name: member.firstName, last_name: member.lastName, department: member.department, email: member.email, internal_phone: member.phone || null, status: 'active' }) });
      if (!profileResult.response.ok) { await serviceSupabase(`/auth/v1/admin/users/${authResult.data.id}`, { method:'DELETE' }); return send(res, 400, { message: 'บันทึกโปรไฟล์ไม่สำเร็จ อาจมีอีเมลหรือรหัสพนักงานซ้ำ' }); }
      return send(res, 201, { message: 'เพิ่มสมาชิก Active สำเร็จ', member: normalizeProfile(profileResult.data[0]), temporaryPassword: member.password ? undefined : password });
    }
    return send(res, 405, { message: 'Method not allowed' });
  } catch (error) { console.error('[admin-members]', error); return send(res, 503, { message: 'ระบบจัดการสมาชิกขัดข้องชั่วคราว' }); }
};
