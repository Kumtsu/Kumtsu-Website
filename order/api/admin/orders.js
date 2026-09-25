const { callSupabase, currentAdmin, readJson, send } = require('../_lib');

const STATUSES = new Set(['new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']);

module.exports = async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });
  try {
    const admin = await currentAdmin(req);
    if (!admin) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาต' });

    if (req.method === 'GET') {
      const result = await callSupabase('/rest/v1/web_orders?select=*&order=created_at.desc&limit=250', {}, true);
      if (!result.response.ok) throw new Error('READ_FAILED');
      return send(res, 200, { orders: result.data, viewer: admin.email });
    }

    const body = await readJson(req);
    const id = String(body.id || '');
    const status = String(body.status || '');
    if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.has(status)) return send(res, 400, { message: 'ข้อมูลสถานะไม่ถูกต้อง' });
    const result = await callSupabase(`/rest/v1/web_orders?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status }),
    }, true);
    if (!result.response.ok || !result.data?.length) throw new Error('UPDATE_FAILED');
    return send(res, 200, { order: result.data[0] });
  } catch (_) {
    return send(res, 503, { message: 'ไม่สามารถโหลดหรือแก้ไขออเดอร์ได้' });
  }
};
