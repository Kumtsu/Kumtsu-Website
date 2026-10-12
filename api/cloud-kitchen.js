const crypto = require('node:crypto');
const { currentUser, readJson, send, serviceSupabase } = require('./_internal-auth');
const seed = require('./_cloud-kitchen-seed.json');

const ADMIN_EMAILS = new Set(['pachara.r@kumtsu.com', 'ruttapong.k@kumtsu.com']);
const BUCKET = 'cloud-kitchen-documents';
const DOCUMENT_TYPES = new Set(['contract', 'payment', 'other']);
const email = (value) => String(value || '').trim().toLowerCase();
const text = (value, max = 4000) => String(value || '').trim().slice(0, max);
const canManageEmail = (value) => ADMIN_EMAILS.has(email(value));
const documentType = (value) => DOCUMENT_TYPES.has(String(value || '').trim()) ? String(value).trim() : '';

function filterDocuments(documents, query = '', type = 'all') {
  const needle = text(query, 220).toLocaleLowerCase('th');
  return documents.filter((item) => {
    const matchesType = type === 'all' || item.document_type === type;
    const haystack = `${item.document_name || ''} ${item.original_filename || ''}`.toLocaleLowerCase('th');
    return matchesType && (!needle || haystack.includes(needle));
  });
}

async function db(path, options = {}) {
  const result = await serviceSupabase(path, options);
  if (!result.response.ok) throw new Error(result.data?.message || result.data?.hint || 'Database request failed');
  return result.data || [];
}

async function profileFor(auth) {
  const rows = await db(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=user_id,employee_id,first_name,last_name,email,status`);
  return rows[0] || null;
}

function missingBranchRows(existingRows, actor) {
  const existing = new Set(existingRows.map((row) => row.branch_code));
  return Object.entries(seed.branches)
    .filter(([branchCode]) => !existing.has(branchCode))
    .map(([branch_code, data]) => ({ branch_code, data, updated_by_email: actor }));
}

async function ensureSeed(actor) {
  const [branches, clients] = await Promise.all([
    db('/rest/v1/cloud_kitchen_branches?select=branch_code'),
    db('/rest/v1/cloud_kitchen_clients?select=id&limit=1'),
  ]);
  const rows = missingBranchRows(branches, actor);
  if (rows.length) {
    await db('/rest/v1/cloud_kitchen_branches', { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates' }, body:JSON.stringify(rows) });
  }
  if (!clients.length) {
    const rows = seed.clients.map((item) => ({ ...item, created_by_email:actor, updated_by_email:actor }));
    await db('/rest/v1/cloud_kitchen_clients', { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates' }, body:JSON.stringify(rows) });
  }
}

async function signedUrl(path) {
  if (!path) return '';
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const result = await serviceSupabase(`/storage/v1/object/sign/${BUCKET}/${encoded}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ expiresIn:3600 }) });
  if (!result.response.ok || !result.data?.signedURL) return '';
  return `${String(process.env.SUPABASE_URL || '').replace(/\/$/,'')}/storage/v1${result.data.signedURL}`;
}

async function loadAll(actor) {
  await ensureSeed(actor);
  const [branches, clients, documents] = await Promise.all([
    db('/rest/v1/cloud_kitchen_branches?select=branch_code,data,updated_at&order=branch_code.asc'),
    db('/rest/v1/cloud_kitchen_clients?select=id,brand,customer,address,phone,logo_url,contract_path,contract_name,payment_path,payment_name,updated_at&order=brand.asc'),
    db('/rest/v1/cloud_kitchen_documents?select=id,client_id,document_name,document_type,object_path,original_filename,mime_type,byte_size,created_by_email,created_at&order=created_at.desc'),
  ]);
  const hydratedDocuments = await Promise.all(documents.map(async (item) => ({ ...item, url:await signedUrl(item.object_path) })));
  const hydrated = await Promise.all(clients.map(async (item) => {
    const clientDocuments = hydratedDocuments.filter((document) => Number(document.client_id) === Number(item.id));
    return {
      ...item,
      logo_source: item.logo_url,
      logo_url: String(item.logo_url || '').startsWith('storage:') ? await signedUrl(String(item.logo_url).slice(8)) : item.logo_url,
      documents: clientDocuments,
    };
  }));
  return { branches:Object.fromEntries(branches.map((row) => [row.branch_code,row.data])), clients:hydrated };
}

function fileBytes(file, allowed) {
  const type = text(file?.type, 80).toLowerCase();
  if (!allowed.has(type) || typeof file?.base64 !== 'string') throw new Error('ชนิดไฟล์ไม่ถูกต้อง');
  const bytes = Buffer.from(file.base64, 'base64');
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 3 MB');
  if (type === 'application/pdf' && bytes.subarray(0,5).toString('ascii') !== '%PDF-') throw new Error('ไฟล์ PDF ไม่ถูกต้อง');
  return { bytes, type };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET','POST','PATCH','DELETE'].includes(req.method)) return send(res,405,{ message:'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res,401,{ message:'กรุณาเข้าสู่ระบบก่อนใช้งานการ์ด 08' });
    const profile = await profileFor(auth);
    if (!profile || profile.status !== 'active') return send(res,403,{ message:'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });
    const actor = email(auth.user.email || profile.email);
    const canManage = canManageEmail(actor);
    if (req.method === 'GET') return send(res,200,{ profile, permissions:{ canManage }, administrators:[...ADMIN_EMAILS], ...(await loadAll(actor)) });
    if (!canManage) return send(res,403,{ message:'เฉพาะผู้ดูแล Cloud Kitchen ที่กำหนดเท่านั้นที่แก้ไขข้อมูลได้' });
    const body = await readJson(req);
    const action = text(body.action, 50);

    if (req.method === 'PATCH' && action === 'save-branch') {
      const branchCode = text(body.branchCode, 8);
      if (!/^BR\d{3}$/.test(branchCode) || !body.data || typeof body.data !== 'object') return send(res,400,{ message:'ข้อมูลสาขาไม่ถูกต้อง' });
      await db('/rest/v1/cloud_kitchen_branches?on_conflict=branch_code', { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'resolution=merge-duplicates,return=representation' }, body:JSON.stringify({ branch_code:branchCode, data:body.data, updated_by_email:actor, updated_at:new Date().toISOString() }) });
      return send(res,200,{ message:'บันทึกข้อมูลสาขาเรียบร้อยแล้ว' });
    }

    if (req.method === 'POST' && action === 'save-client') {
      const id = Number(body.id) || null;
      const record = { brand:text(body.brand,160), customer:text(body.customer,200), address:text(body.address,1000), phone:text(body.phone,60), logo_url:text(body.logoUrl,1000), updated_by_email:actor, updated_at:new Date().toISOString() };
      if (!record.brand) return send(res,400,{ message:'กรุณากรอกชื่อแบรนด์' });
      let rows;
      if (id) rows = await db(`/rest/v1/cloud_kitchen_clients?id=eq.${id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json', Prefer:'return=representation' }, body:JSON.stringify(record) });
      else rows = await db('/rest/v1/cloud_kitchen_clients', { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'return=representation' }, body:JSON.stringify({ ...record, created_by_email:actor }) });
      return send(res,id?200:201,{ message:'บันทึกข้อมูลแบรนด์เรียบร้อยแล้ว', client:rows[0] });
    }

    if (req.method === 'POST' && action === 'upload') {
      const id = Number(body.id); const kind = text(body.kind,20);
      if (!Number.isSafeInteger(id) || !['logo','document'].includes(kind)) return send(res,400,{ message:'ข้อมูลอัปโหลดไม่ถูกต้อง' });
      const allowed = kind === 'logo' ? new Set(['image/jpeg','image/png','image/webp']) : new Set(['application/pdf']);
      const { bytes, type } = fileBytes(body.file, allowed);
      const name = text(body.documentName, 220);
      const category = documentType(body.documentType);
      if (kind === 'document' && (!name || !category)) return send(res,400,{ message:'กรุณาระบุชื่อและประเภทเอกสาร' });
      const ext = type === 'application/pdf' ? 'pdf' : type.split('/')[1].replace('jpeg','jpg');
      const path = `${id}/${kind === 'document' ? 'documents' : 'logo'}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      const uploaded = await serviceSupabase(`/storage/v1/object/${BUCKET}/${encoded}`, { method:'POST', headers:{ 'Content-Type':type, 'x-upsert':'false' }, body:bytes });
      if (!uploaded.response.ok) throw new Error(uploaded.data?.message || 'Upload failed');
      if (kind === 'logo') {
        await db(`/rest/v1/cloud_kitchen_clients?id=eq.${id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ logo_url:`storage:${path}`, updated_by_email:actor, updated_at:new Date().toISOString() }) });
        return send(res,200,{ message:'อัปโหลดโลโก้เรียบร้อยแล้ว' });
      }
      try {
        const rows = await db('/rest/v1/cloud_kitchen_documents', { method:'POST', headers:{ 'Content-Type':'application/json', Prefer:'return=representation' }, body:JSON.stringify({ client_id:id, document_name:name, document_type:category, object_path:path, original_filename:text(body.file.name,220), mime_type:type, byte_size:bytes.length, created_by_email:actor }) });
        return send(res,201,{ message:'เพิ่มเอกสารเรียบร้อยแล้ว', document:{ ...rows[0], url:await signedUrl(path) } });
      } catch (error) {
        await serviceSupabase(`/storage/v1/object/${BUCKET}/${encoded}`, { method:'DELETE' }).catch(() => {});
        throw error;
      }
    }

    if (req.method === 'DELETE' && action === 'delete-document') {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id)) return send(res,400,{ message:'ข้อมูลเอกสารไม่ถูกต้อง' });
      const rows = await db(`/rest/v1/cloud_kitchen_documents?id=eq.${id}&select=id,object_path`);
      if (!rows[0]) return send(res,404,{ message:'ไม่พบเอกสารนี้' });
      const encoded = rows[0].object_path.split('/').map(encodeURIComponent).join('/');
      const removed = await serviceSupabase(`/storage/v1/object/${BUCKET}/${encoded}`, { method:'DELETE' });
      if (!removed.response.ok && removed.response.status !== 404) throw new Error(removed.data?.message || 'ลบไฟล์ไม่สำเร็จ');
      await db(`/rest/v1/cloud_kitchen_documents?id=eq.${id}`, { method:'DELETE' });
      return send(res,200,{ message:'ลบเอกสารเรียบร้อยแล้ว' });
    }

    if (req.method === 'DELETE' && action === 'delete-client') {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id)) return send(res,400,{ message:'ข้อมูลแบรนด์ไม่ถูกต้อง' });
      await db(`/rest/v1/cloud_kitchen_clients?id=eq.${id}`, { method:'DELETE' });
      return send(res,200,{ message:'ลบแบรนด์เรียบร้อยแล้ว' });
    }
    return send(res,400,{ message:'ไม่รองรับคำสั่งนี้' });
  } catch (error) {
    console.error('[cloud-kitchen]', error);
    return send(res,503,{ message:error.message || 'ระบบ Cloud Kitchen ขัดข้องชั่วคราว' });
  }
};

module.exports._test = { ADMIN_EMAILS, DOCUMENT_TYPES, canManageEmail, documentType, email, fileBytes, filterDocuments, missingBranchRows, text };
