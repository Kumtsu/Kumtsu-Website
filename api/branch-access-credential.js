const { readJson, send, serviceSupabase } = require('./_internal-auth');
const { decryptSecret, requireActiveUser } = require('./_branch-access');
const { isFoodstory } = require('../internal/branch-access-catalog');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const access = await requireActiveUser(req, res);
    if (!access) return;
    const body = await readJson(req);
    const kind = String(body.kind || '');
    const field = body.field === undefined ? 'password' : String(body.field);
    const id = Number(body.id);
    const table = kind === 'brand' ? 'branch_access_brands' : kind === 'channel' ? 'branch_access_channels' : kind === 'foodstory' ? 'branch_access_foodstory' : null;
    if (!table || !Number.isSafeInteger(id) || id <= 0) return send(res, 400, { message: 'รายการไม่ถูกต้อง' });
    if (!['password', 'wongnai_pos_pin'].includes(field) || (field === 'wongnai_pos_pin' && !['foodstory', 'channel'].includes(kind))) return send(res, 400, { message: 'รายการไม่ถูกต้อง' });
    const column = field === 'password' ? 'password_encrypted' : 'wongnai_pos_pin_encrypted';
    const fields = field === 'wongnai_pos_pin' && kind === 'channel' ? `name,${column}` : column;
    const result = await serviceSupabase(`/rest/v1/${table}?id=eq.${id}&select=${fields}`);
    const row = result.response.ok ? result.data?.[0] : null;
    if (field === 'wongnai_pos_pin' && kind === 'channel' && row && !isFoodstory(row.name)) return send(res, 400, { message: 'รหัส 4 ตัว Wongnai pos ใช้ได้กับบัญชี FoodStory เท่านั้น' });
    const encrypted = row?.[column];
    if (!encrypted) return send(res, 404, { message: field === 'password' ? 'ไม่พบรหัสผ่านของรายการนี้' : 'ยังไม่ได้ระบุรหัส 4 ตัว Wongnai pos' });
    return send(res, 200, { [field]: decryptSecret(encrypted) });
  } catch (error) {
    console.error('[branch-access-credential]', error);
    return send(res, 503, { message: 'ไม่สามารถอ่านรหัสผ่านได้' });
  }
};
