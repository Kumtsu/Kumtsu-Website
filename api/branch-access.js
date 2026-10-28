const { readJson, send, serviceSupabase } = require('./_internal-auth');
const { TABLES, cleanCreate, cleanChanges, loadSnapshot, requireActiveUser } = require('./_branch-access');
const { BRAND_OPTIONS, CHANNEL_OPTIONS, isFoodstory } = require('../internal/branch-access-catalog');

async function findRows(path) {
  const result = await serviceSupabase(path, { headers: { Accept: 'application/json' } });
  if (!result.response.ok) throw new Error(result.data?.message || 'Could not read Branch Access records');
  return Array.isArray(result.data) ? result.data : [];
}

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
      const config = Object.prototype.hasOwnProperty.call(TABLES, entity) ? TABLES[entity] : null;
      const values = body.values || {};
      let branchCode;
      if (entity === 'brand' || entity === 'channel') {
        const parentField = entity === 'brand' ? 'branch_id' : 'brand_id';
        const parentId = Number(values[parentField]);
        const name = String(values.name || '').trim();
        const validName = entity === 'brand' ? BRAND_OPTIONS.some((brand) => brand.name === name) : CHANNEL_OPTIONS.includes(name);
        if (!Number.isSafeInteger(parentId) || parentId <= 0 || !validName) return send(res, 400, { message: 'กรุณาเลือกแบรนด์หรือช่องทางขายที่กำหนด' });

        const parentTable = entity === 'brand' ? TABLES.branch.table : TABLES.brand.table;
        const parentFields = entity === 'brand' ? 'id,code' : 'id,branch_id';
        const [parent] = await findRows(`/rest/v1/${parentTable}?select=${parentFields}&id=eq.${parentId}`);
        if (!parent) return send(res, 404, { message: entity === 'brand' ? 'ไม่พบสาขาที่เลือก' : 'ไม่พบแบรนด์ที่เลือก' });
        branchCode = parent.code;

        const duplicates = await findRows(`/rest/v1/${config.table}?select=id&${parentField}=eq.${parentId}&name=eq.${encodeURIComponent(name)}&limit=1`);
        if (duplicates.length) return send(res, 409, { message: entity === 'brand' ? 'สาขานี้มีแบรนด์ที่เลือกแล้ว' : 'แบรนด์นี้มีช่องทางขายที่เลือกแล้ว' });

        if (entity === 'channel' && isFoodstory(name)) {
          const branchBrands = await findRows(`/rest/v1/${TABLES.brand.table}?select=id&branch_id=eq.${parent.branch_id}`);
          const brandIds = branchBrands.map((brand) => Number(brand.id)).filter((id) => Number.isSafeInteger(id) && id > 0);
          if (!brandIds.length) return send(res, 404, { message: 'ไม่พบแบรนด์ในสาขาที่เลือก' });
          const foodstoryRows = await findRows(`/rest/v1/${TABLES.channel.table}?select=id&brand_id=in.(${brandIds.join(',')})&name=ilike.food*story*&limit=1`);
          if (foodstoryRows.length) return send(res, 409, { message: 'สาขานี้มีบัญชี FoodStory แล้ว กรุณาแก้ไขบัญชีเดิม' });
        }
      }
      const record = cleanCreate(entity, values, { branchCode });
      if (!config || !record) return send(res, 400, { message: 'ข้อมูลที่ต้องการเพิ่มไม่ครบถ้วน' });

      const id = await nextRecordId(config.table);
      const insert = await serviceSupabase(`/rest/v1/${config.table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ id, ...record }),
      });
      if (!insert.response.ok || !insert.data?.length) {
        const duplicate = insert.data?.code === '23505';
        return send(res, duplicate ? 409 : 400, { message: duplicate ? 'ข้อมูลซ้ำหรือมีการเพิ่มข้อมูลพร้อมกัน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง' : 'เพิ่มข้อมูลไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองอีกครั้ง' });
      }

      const auditChanges = { ...record };
      if (auditChanges.password_encrypted) auditChanges.password_encrypted = '[created]';
      await serviceSupabase('/rest/v1/branch_access_audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ actor_email: access.auth.user.email, entity_type: entity, entity_id: id, changes: auditChanges }),
      });
      return send(res, 201, { id, entity, message: entity === 'branch' ? 'เพิ่มสาขาแล้ว' : entity === 'brand' ? 'เพิ่มแบรนด์แล้ว' : 'เพิ่มช่องทางขายแล้ว' });
    }

    return send(res, 405, { message: 'Method not allowed' });
  } catch (error) {
    console.error('[branch-access]', error);
    return send(res, 503, { message: 'ไม่สามารถโหลดระบบ Branch Access ได้' });
  }
};
