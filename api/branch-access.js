const { readJson, send, serviceSupabase } = require('./_internal-auth');
const { TABLES, cleanCreate, cleanChanges, loadSnapshot, requireActiveUser } = require('./_branch-access');

async function nextRecordId(table) {
  const result = await serviceSupabase(`/rest/v1/${table}?select=id&order=id.desc&limit=1`, { headers: { Accept: 'application/json' } });
  if (!result.response.ok) throw new Error(result.data?.message || 'Could not allocate record ID');
  const currentId = Number(result.data?.[0]?.id || 0);
  if (!Number.isSafeInteger(currentId) || currentId < 0) throw new Error('Invalid record ID');
  return currentId + 1;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const access = await requireActiveUser(req, res);
    if (!access) return;

    if (req.method === 'GET') {
      const snapshot = await loadSnapshot();
      return send(res, 200, {
        ...snapshot,
        access: {
          canEdit: access.canEdit,
          email: access.auth.user.email || access.profile.email,
          displayName: `${access.profile.first_name} ${access.profile.last_name}`.trim(),
        },
      });
    }

    if (req.method === 'PATCH') {
      if (!access.canEdit) return send(res, 403, { message: 'เฉพาะผู้ดูแลระบบที่กำหนดเท่านั้นที่แก้ไขข้อมูลได้' });
      const body = await readJson(req);
      const entity = String(body.entity || '');
      const id = Number(body.id);
      const config = TABLES[entity];
      const changes = cleanChanges(entity, body.changes);
      if (!config || !Number.isSafeInteger(id) || id <= 0 || !changes || Object.keys(changes).length <= 1) {
        return send(res, 400, { message: 'ข้อมูลแก้ไขไม่ถูกต้อง' });
      }
      const update = await serviceSupabase(`/rest/v1/${config.table}?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(changes),
      });
      if (!update.response.ok || !update.data?.length) return send(res, 400, { message: update.data?.message || 'บันทึกข้อมูลไม่สำเร็จ' });
      const auditChanges = { ...changes };
      if (auditChanges.password_encrypted) auditChanges.password_encrypted = '[updated]';
      await serviceSupabase('/rest/v1/branch_access_audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ actor_email: access.auth.user.email, entity_type: entity, entity_id: id, changes: auditChanges }),
      });
      return send(res, 200, { message: 'บันทึกข้อมูลแล้ว' });
    }

    if (req.method === 'POST') {
      if (!access.canEdit) return send(res, 403, { message: 'เฉพาะผู้ดูแลระบบที่กำหนดเท่านั้นที่เพิ่มข้อมูลได้' });
      const body = await readJson(req);
      const entity = String(body.entity || '');
      const config = TABLES[entity];
      const record = cleanCreate(entity, body.values);
      if (!config || !record) return send(res, 400, { message: 'ข้อมูลที่ต้องการเพิ่มไม่ครบถ้วน' });

      const id = await nextRecordId(config.table);
      const insert = await serviceSupabase(`/rest/v1/${config.table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ id, ...record }),
      });
      if (!insert.response.ok || !insert.data?.length) return send(res, 400, { message: insert.data?.message || 'เพิ่มข้อมูลไม่สำเร็จ โปรดตรวจรหัสหรือชื่อที่ซ้ำกัน' });

      const auditChanges = { ...record };
      if (auditChanges.password_encrypted) auditChanges.password_encrypted = '[created]';
      await serviceSupabase('/rest/v1/branch_access_audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ actor_email: access.auth.user.email, entity_type: entity, entity_id: id, changes: auditChanges }),
      });
      return send(res, 201, { id, entity, message: entity === 'branch' ? 'เพิ่มสาขาแล้ว' : 'เพิ่มแบรนด์แล้ว' });
    }

    return send(res, 405, { message: 'Method not allowed' });
  } catch (error) {
    console.error('[branch-access]', error);
    return send(res, 503, { message: 'ไม่สามารถโหลดระบบ Branch Access ได้' });
  }
};
