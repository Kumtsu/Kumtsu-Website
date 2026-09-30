const { callSupabase, currentAdmin, env, readJson, send } = require('../_lib');

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const admin = await currentAdmin(req);
    if (!admin) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาต' });
    const body = await readJson(req, 2_200_000);
    const type = String(body.type || '');
    const extension = TYPES[type];
    const match = String(body.data || '').match(/^data:image\/(?:jpeg|png|webp);base64,(.+)$/);
    if (!extension || !match) return send(res, 400, { message: 'รองรับเฉพาะรูป JPG, PNG หรือ WebP' });
    const bytes = Buffer.from(match[1], 'base64');
    if (!bytes.length || bytes.length > 1_500_000) return send(res, 400, { message: 'รูปต้องมีขนาดไม่เกิน 1.5 MB' });
    const safeId = String(body.itemId || 'menu').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'menu';
    const path = `${safeId}-${Date.now()}.${extension}`;
    const upload = await callSupabase(`/storage/v1/object/menu-images/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': type, 'x-upsert': 'false' },
      body: bytes,
    }, true);
    if (!upload.response.ok) throw new Error('UPLOAD_FAILED');
    const { url } = env();
    return send(res, 201, { url: `${url}/storage/v1/object/public/menu-images/${path}` });
  } catch (_) {
    return send(res, 503, { message: 'อัปโหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง' });
  }
};
