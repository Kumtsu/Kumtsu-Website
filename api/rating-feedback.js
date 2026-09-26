const { currentUser, send, supabase } = require('./_internal-auth');
const dashboardData = require('./_rating-feedback-data.json');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return send(res, 405, { message: 'Method not allowed' });

  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนดูข้อมูลภายใน' });

    const { response, data } = await supabase(
      `/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=employee_id,first_name,last_name,email,status`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' } },
    );
    const profile = response.ok ? data?.[0] : null;
    if (!profile || profile.status !== 'active') {
      return send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });
    }

    return send(res, 200, {
      user: { id: auth.user.id, email: auth.user.email },
      profile,
      ...dashboardData,
    });
  } catch (error) {
    console.error('[rating-feedback]', error);
    return send(res, 503, { message: 'ไม่สามารถโหลดข้อมูล Rating & Feedback ได้' });
  }
};
