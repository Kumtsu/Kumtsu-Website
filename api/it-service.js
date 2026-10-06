const { currentUser, readJson, send, serviceSupabase } = require('./_internal-auth');

const IT_EMAILS = new Set(['pachara.r@kumtsu.com', 'krissana.s@kumtsu.com']);
const POSITIONS = new Set(['พนักงานหน้าสาขา','AM','OM','ACC','HR','Audit','Admin','Marketing','IT','Purchase','Inventory','Production','QC','Owner']);
const STATUSES = new Set(['waiting','progress','urgent','completed']);
const EQUIPMENT_TYPES = new Set(['มือถือ','ไอแพด','เครื่องพิมพ์ใบเสร็จ','เครื่องปริ้น Inkjet','สายชาร์จ Type-C','สายชาร์จ iPad','โน้ตบุ๊ก','เมาส์','คีย์บอร์ด','จอคอมพิวเตอร์','CCTV']);
const JOB_SELECT = 'id,request_date,requester_user_id,requester_email,requester_name,position,branch,issue_type,description,status,assigned_to,scheduled_date,created_at,updated_at,closed_at,closed_by_email';
const ITEM_SELECT = 'id,equipment_type,brand,model,serial_number,quantity,minimum_quantity,branch,storage_location,status,note,created_by_email,updated_by_email,created_at,updated_at';

const email = (value) => String(value || '').trim().toLowerCase();
const text = (value, max = 4000) => String(value || '').trim().slice(0, max);

async function activeProfile(auth) {
  const result = await serviceSupabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=user_id,employee_id,first_name,last_name,email,status`);
  return result.response.ok ? result.data?.[0] : null;
}

async function db(path, options = {}) {
  const result = await serviceSupabase(path, options);
  if (!result.response.ok) throw new Error(result.data?.message || result.data?.hint || 'Database request failed');
  return result.data || [];
}

async function audit(jobId, action, details, actor) {
  await db('/rest/v1/it_job_history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, action, details, changed_by_email: actor }) });
}

async function loadAll() {
  const [jobs, items, issues] = await Promise.all([
    db(`/rest/v1/it_jobs?select=${JOB_SELECT}&order=request_date.desc,created_at.desc`),
    db(`/rest/v1/it_inventory_items?select=${ITEM_SELECT}&order=equipment_type.asc,branch.asc,created_at.asc`),
    db('/rest/v1/it_job_inventory_issues?select=id,job_id,inventory_item_id,quantity,old_device_status,issued_by_email,issued_at,returned_at&order=issued_at.asc'),
  ]);
  return { jobs, items, issues };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET','POST','PATCH','DELETE'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนใช้งานการ์ด 07' });
    const profile = await activeProfile(auth);
    if (!profile || profile.status !== 'active') return send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });
    const actor = email(auth.user.email || profile.email);
    const canManage = IT_EMAILS.has(actor);

    if (req.method === 'GET') {
      const data = await loadAll();
      return send(res, 200, { profile, permissions: { canManage }, technicians: [...IT_EMAILS], ...data });
    }

    const body = await readJson(req);
    const action = text(body.action, 50);

    if (req.method === 'POST' && action === 'create-job') {
      const position = text(body.position, 80);
      const branch = text(body.branch, 120);
      const issueType = text(body.issueType, 120);
      const description = text(body.description, 4000);
      const requestDate = text(body.requestDate, 10);
      if (!POSITIONS.has(position) || !branch || !issueType || !description || !/^\d{4}-\d{2}-\d{2}$/.test(requestDate)) return send(res, 400, { message: 'กรุณากรอกข้อมูลเปิดงานให้ครบถ้วน' });
      const result = await db('/rest/v1/it_jobs', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ request_date: requestDate, requester_user_id: auth.user.id, requester_email: actor, requester_name: `${profile.first_name} ${profile.last_name}`.trim(), position, branch, issue_type: issueType, description }) });
      return send(res, 201, { message: 'เปิดงานไอทีเรียบร้อยแล้ว', job: result[0] });
    }

    if (!canManage) return send(res, 403, { message: 'เฉพาะผู้ดูแลฝ่ายไอทีเท่านั้นที่แก้ไขงานหรือสต๊อกได้' });

    if (req.method === 'POST' && action === 'add-inventory') {
      const equipmentType = text(body.equipmentType, 120);
      const brand = text(body.brand, 120);
      const model = text(body.model, 180);
      const branch = text(body.branch, 120);
      const location = text(body.storageLocation, 180);
      const note = text(body.note, 1000);
      const quantity = Number(body.quantity);
      const minimumQuantity = Math.max(0, Number(body.minimumQuantity) || 0);
      const serials = Array.isArray(body.serialNumbers) ? body.serialNumbers.map((value) => text(value, 180)).filter(Boolean) : [];
      if (!EQUIPMENT_TYPES.has(equipmentType) || !brand || !model || !branch || !location || !Number.isSafeInteger(quantity) || quantity < 1) return send(res, 400, { message: 'กรุณากรอกข้อมูลอุปกรณ์ให้ครบถ้วน' });
      const rows = serials.length ? Array.from({ length: quantity }, (_, index) => ({ equipment_type: equipmentType, brand, model, serial_number: serials[index] || null, quantity: 1, minimum_quantity: minimumQuantity, branch, storage_location: location, note, created_by_email: actor, updated_by_email: actor })) : [{ equipment_type: equipmentType, brand, model, quantity, minimum_quantity: minimumQuantity, branch, storage_location: location, note, created_by_email: actor, updated_by_email: actor }];
      const result = await db('/rest/v1/it_inventory_items', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(rows) });
      return send(res, 201, { message: 'เพิ่มอุปกรณ์เข้าคลังและสาขาเรียบร้อยแล้ว', items: result });
    }

    if (req.method === 'POST' && action === 'issue-stock') {
      const jobId = Number(body.jobId); const inventoryItemId = Number(body.inventoryItemId); const quantity = Number(body.quantity);
      if (![jobId, inventoryItemId, quantity].every(Number.isSafeInteger) || quantity < 1) return send(res, 400, { message: 'ข้อมูลตัดสต๊อกไม่ถูกต้อง' });
      const issue = await db('/rest/v1/rpc/issue_it_inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_job_id: jobId, p_inventory_item_id: inventoryItemId, p_quantity: quantity, p_actor_email: actor }) });
      return send(res, 200, { message: 'ตัดสต๊อกและผูกกับงานเรียบร้อยแล้ว', issue });
    }

    if (req.method === 'POST' && action === 'complete-repair') {
      const inventoryItemId = Number(body.inventoryItemId);
      if (!Number.isSafeInteger(inventoryItemId)) return send(res, 400, { message: 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' });
      const item = await db('/rest/v1/rpc/complete_it_repair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_inventory_item_id: inventoryItemId, p_actor_email: actor }) });
      return send(res, 200, { message: 'บันทึกซ่อมเสร็จและเพิ่มเครื่องกลับเข้าคลังแล้ว', item });
    }

    if (req.method === 'PATCH' && action === 'update-old-device') {
      const issueId = Number(body.issueId);
      const oldDeviceStatus = text(body.oldDeviceStatus, 30);
      if (!Number.isSafeInteger(issueId) || !['pending_return','repair','returned_to_stock'].includes(oldDeviceStatus)) return send(res, 400, { message: 'สถานะเครื่องเก่าไม่ถูกต้อง' });
      const patch = { old_device_status: oldDeviceStatus, returned_at: oldDeviceStatus === 'pending_return' ? null : new Date().toISOString() };
      const result = await db(`/rest/v1/it_job_inventory_issues?id=eq.${issueId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      return send(res, 200, { message: 'อัปเดตสถานะเครื่องเก่าเรียบร้อยแล้ว', issue: result[0] });
    }

    if (req.method === 'PATCH' && action === 'update-job') {
      const id = Number(body.id); const status = text(body.status, 30);
      const assignedTo = Array.isArray(body.assignedTo) ? body.assignedTo.map(email).filter((value) => IT_EMAILS.has(value)) : [];
      const scheduledDate = body.scheduledDate ? text(body.scheduledDate, 10) : null;
      const requestDate = text(body.requestDate, 10);
      const position = text(body.position, 80);
      const branch = text(body.branch, 120);
      const issueType = text(body.issueType, 120);
      const description = text(body.description, 4000);
      if (!Number.isSafeInteger(id) || !STATUSES.has(status) || !assignedTo.length || !/^\d{4}-\d{2}-\d{2}$/.test(requestDate) || !POSITIONS.has(position) || !branch || !issueType || !description || (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate))) return send(res, 400, { message: 'กรุณากรอกข้อมูลงานและผู้รับผิดชอบให้ครบถ้วน' });
      const patch = { request_date: requestDate, position, branch, issue_type: issueType, description, status, assigned_to: assignedTo, scheduled_date: scheduledDate, updated_at: new Date().toISOString() };
      if (status === 'completed') { patch.closed_at = new Date().toISOString(); patch.closed_by_email = actor; }
      const result = await db(`/rest/v1/it_jobs?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(patch) });
      if (!result[0]) return send(res, 404, { message: 'ไม่พบงาน' });
      await audit(id, 'job_updated', { request_date: requestDate, position, branch, issue_type: issueType, description, status, assigned_to: assignedTo, scheduled_date: scheduledDate }, actor);
      return send(res, 200, { message: status === 'completed' ? 'ปิดงานเรียบร้อยแล้ว' : 'อัปเดตงานเรียบร้อยแล้ว', job: result[0] });
    }

    if (req.method === 'DELETE' && action === 'delete-job') {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id)) return send(res, 400, { message: 'ข้อมูลงานไม่ถูกต้อง' });
      const result = await db('/rest/v1/rpc/delete_it_job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_job_id: id, p_actor_email: actor }) });
      if (!result) return send(res, 404, { message: 'ไม่พบงานที่ต้องการลบ' });
      return send(res, 200, { message: 'ลบงานและคืนจำนวนอุปกรณ์เข้าสต๊อกเรียบร้อยแล้ว' });
    }

    if (req.method === 'PATCH' && action === 'edit-inventory') {
      const id = Number(body.id); const quantity = Number(body.quantity);
      if (!Number.isSafeInteger(id) || !Number.isSafeInteger(quantity) || quantity < 0) return send(res, 400, { message: 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' });
      const update = { equipment_type: text(body.equipmentType,120), brand: text(body.brand,120), model: text(body.model,180), serial_number: text(body.serialNumber,180) || null, quantity, minimum_quantity: Math.max(0,Number(body.minimumQuantity)||0), branch: text(body.branch,120), storage_location: text(body.storageLocation,180), note: text(body.note,1000), updated_by_email: actor, updated_at: new Date().toISOString() };
      if (!EQUIPMENT_TYPES.has(update.equipment_type) || !update.brand || !update.model || !update.branch || !update.storage_location) return send(res, 400, { message: 'กรุณากรอกข้อมูลอุปกรณ์ให้ครบถ้วน' });
      const result = await db(`/rest/v1/it_inventory_items?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(update) });
      return send(res, 200, { message: 'แก้ไขอุปกรณ์เรียบร้อยแล้ว', item: result[0] });
    }

    if (req.method === 'DELETE' && action === 'delete-inventory') {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id)) return send(res, 400, { message: 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' });
      await db(`/rest/v1/it_inventory_items?id=eq.${id}`, { method: 'DELETE' });
      return send(res, 200, { message: 'ลบอุปกรณ์เรียบร้อยแล้ว' });
    }

    return send(res, 400, { message: 'ไม่รองรับคำสั่งนี้' });
  } catch (error) {
    console.error('[it-service]', error);
    return send(res, 503, { message: 'ระบบงานไอทีขัดข้องชั่วคราว' });
  }
};

module.exports._test = { email, text, EQUIPMENT_TYPES, POSITIONS, STATUSES };
