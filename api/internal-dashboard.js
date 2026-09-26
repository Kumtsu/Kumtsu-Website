const { currentUser, send, supabase } = require('./_internal-auth');

const systems = [
  { id: '01', title: 'Sale Dashboard', description: 'ระบบวิเคราะห์ยอดขาย', url: 'https://kumtsu-sales-dashboard.vercel.app/', status: 'live' },
  { id: '02', title: 'Time Pause Dashboard', description: 'ระบบตรวจสอบการกดปิดร้าน', url: 'https://kumtsu-offline-july-2026.kumtsu-7034.chatgpt.site/', status: 'live' },
  { id: '03', title: 'Rating & Feedback Dashboard', description: 'ระบบตรวจสอบคะแนนและข้อเสนอแนะ', url: '/internal/rating-feedback', status: 'live' },
  { id: '04', title: 'Email & Pass Login App Kumtsu', description: 'รวมอีเมลและรหัสเข้าแอปคุ้มสึ', url: null, status: 'coming-soon' },
];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return send(res, 405, { message: 'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนดูข้อมูลภายใน' });
    const { response, data } = await supabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=employee_id,first_name,last_name,email,status`, {
      headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' },
    });
    const profile = response.ok ? data?.[0] : null;
    if (!profile || profile.status !== 'active') return send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });
    return send(res, 200, { user: { id: auth.user.id, email: auth.user.email }, profile, systems });
  } catch (error) {
    console.error('[internal-dashboard]', error);
    return send(res, 503, { message: 'ไม่สามารถโหลดระบบงานภายในได้' });
  }
};
