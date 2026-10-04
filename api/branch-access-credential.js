const { readJson, send, serviceSupabase } = require('./_internal-auth');
const { decryptSecret, requireActiveUser } = require('./_branch-access');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const access = await requireActiveUser(req, res);
    if (!access) return;
    const body = await readJson(req);
    const kind = String(body.kind || '');
    const id = Number(body.id);
    const table = kind === 'brand' ? 'branch_access_brands' : kind === 'channel' ? 'branch_access_channels' : null;
    if (!table || !Number.isSafeInteger(id) || id <= 0) return send(res, 400, { message: 'รายการไม่ถูกต้อง' });
    const result = await serviceSupabase(`/rest/v1/${table}?id=eq.${id}&select=password_encrypted`);
    const encrypted = result.response.ok ? result.data?.[0]?.password_encrypted : null;
    if (!encrypted) return send(res, 404, { message: 'ไม่พบรหัสผ่านของรายการนี้' });
    return send(res, 200, { password: decryptSecret(encrypted) });
  } catch (error) {
    console.error('[branch-access-credential]', error);
    return send(res, 503, { message: 'ไม่สามารถอ่านรหัสผ่านได้' });
  }
};
