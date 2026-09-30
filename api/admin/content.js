const { readJson, requireAdmin, send, serviceSupabase } = require('./_admin-utils');

const KEYS = new Set(['home', 'news']);
const keyFrom = (req) => String(req.query?.key || 'home').trim().toLowerCase();

module.exports = async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  const key = keyFrom(req);
  if (!KEYS.has(key)) return send(res, 400, { message: 'ประเภทเนื้อหาไม่ถูกต้อง' });
  try {
    if (req.method === 'GET') {
      const { response, data } = await serviceSupabase(`/rest/v1/site_content?content_key=eq.${encodeURIComponent(key)}&select=*`);
      if (!response.ok) return send(res, 503, { message: 'โหลดข้อมูลไม่สำเร็จ' });
      return send(res, 200, { content: data?.[0] || { content_key: key, draft_data: {}, published_data: {} } });
    }
    if (req.method === 'PUT') {
      const body = await readJson(req);
      if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return send(res, 400, { message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
      const payload = { content_key: key, draft_data: body.data, updated_by: auth.user.id, updated_at: new Date().toISOString() };
      const { response, data } = await serviceSupabase('/rest/v1/site_content?on_conflict=content_key', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(payload),
      });
      if (!response.ok) return send(res, 503, { message: 'บันทึกร่างไม่สำเร็จ' });
      return send(res, 200, { message: 'บันทึกร่างแล้ว', content: data?.[0] });
    }
    if (req.method === 'POST') {
      const { response: readResponse, data: rows } = await serviceSupabase(`/rest/v1/site_content?content_key=eq.${encodeURIComponent(key)}&select=draft_data`);
      if (!readResponse.ok || !rows?.[0]) return send(res, 404, { message: 'ไม่พบร่างที่ต้องการเผยแพร่' });
      const now = new Date().toISOString();
      const { response } = await serviceSupabase(`/rest/v1/site_content?content_key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ published_data: rows[0].draft_data, updated_by: auth.user.id, updated_at: now, published_at: now }),
      });
      if (!response.ok) return send(res, 503, { message: 'เผยแพร่ข้อมูลไม่สำเร็จ' });
      return send(res, 200, { message: 'เผยแพร่เนื้อหาเรียบร้อยแล้ว', publishedAt: now });
    }
    return send(res, 405, { message: 'Method not allowed' });
  } catch (error) {
    console.error('[admin-content] request failed', error);
    return send(res, 500, { message: 'เกิดข้อผิดพลาด กรุณาลองใหม่' });
  }
};
