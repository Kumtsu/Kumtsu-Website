const crypto = require('crypto');
const { readJson, requireAdmin, send, serviceSupabase } = require('./_admin-utils');
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

module.exports = async function handler(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) return;
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const match = String(body.dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
    if (!match || !TYPES[match[1]]) return send(res, 400, { message: 'รองรับเฉพาะ JPG, PNG, WEBP และ GIF' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) return send(res, 400, { message: 'รูปภาพต้องมีขนาดไม่เกิน 10 MB' });
    const folder = String(body.folder || 'general').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'general';
    const filename = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${TYPES[match[1]]}`;
    const { response, data } = await serviceSupabase(`/storage/v1/object/site-content/${filename}`, {
      method: 'POST', headers: { 'Content-Type': match[1], 'x-upsert': 'false' }, body: bytes,
    });
    if (!response.ok) { console.error('[content-upload] storage error', data); return send(res, 503, { message: 'อัปโหลดรูปไม่สำเร็จ' }); }
    const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    return send(res, 200, { url: `${base}/storage/v1/object/public/site-content/${filename}` });
  } catch (error) {
    console.error('[content-upload] failed', error);
    return send(res, 500, { message: 'อัปโหลดรูปไม่สำเร็จ' });
  }
};
