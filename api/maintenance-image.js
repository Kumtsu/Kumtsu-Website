const crypto = require('node:crypto');
const { currentUser, readJson, send, serviceSupabase } = require('./_internal-auth');

const ADMIN_EMAILS = new Set(['uthumporn.p@kumtsu.com', 'pachara.r@kumtsu.com']);
const MIME_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BUCKET = 'maintenance-closeouts';
function email(value) { return String(value || '').trim().toLowerCase(); }
function safeName(value) { return String(value || 'image').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'image'; }
function validSignature(bytes, type) {
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  return type === 'image/webp' && bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP';
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  let objectPath = '';
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบ' });
    const actorEmail = email(auth.user.email);
    const body = await readJson(req);
    const jobId = Number(body.id);
    const image = body.image || {};
    const mimeType = String(image.type || '').toLowerCase();
    if (!Number.isSafeInteger(jobId) || jobId < 1 || !MIME_EXTENSIONS[mimeType] || typeof image.base64 !== 'string') return send(res, 400, { message: 'ไฟล์รูปภาพไม่ถูกต้อง' });
    const bytes = Buffer.from(image.base64, 'base64');
    if (!bytes.length || bytes.length > 3 * 1024 * 1024 || !validSignature(bytes, mimeType)) return send(res, 400, { message: 'รองรับเฉพาะรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 3 MB' });
    const jobResult = await serviceSupabase(`/rest/v1/maintenance_jobs?id=eq.${jobId}&select=id,status,assigned_to`);
    const job = jobResult.response.ok ? jobResult.data?.[0] : null;
    if (!job || ['completed','cancelled'].includes(job.status)) return send(res, 409, { message: 'ไม่พบงานหรืองานสิ้นสุดแล้ว' });
    let authorized = ADMIN_EMAILS.has(actorEmail);
    if (!authorized) {
      const tech = await serviceSupabase(`/rest/v1/maintenance_technicians?email=eq.${encodeURIComponent(actorEmail)}&active=eq.true&select=technician_key`);
      const key = tech.response.ok ? tech.data?.[0]?.technician_key : null;
      authorized = Boolean(key && (job.assigned_to || []).includes(key));
    }
    if (!authorized) return send(res, 403, { message: 'คุณไม่มีสิทธิ์เพิ่มรูปให้งานนี้' });
    objectPath = `${jobId}/${crypto.randomUUID()}-${safeName(image.name)}.${MIME_EXTENSIONS[mimeType]}`;
    const encoded = objectPath.split('/').map(encodeURIComponent).join('/');
    const uploaded = await serviceSupabase(`/storage/v1/object/${BUCKET}/${encoded}`, { method: 'POST', headers: { 'Content-Type': mimeType, 'x-upsert': 'false' }, body: bytes });
    if (!uploaded.response.ok) throw new Error(uploaded.data?.message || 'Upload failed');
    const saved = await serviceSupabase('/rest/v1/maintenance_job_attachments', { method: 'POST', headers: { 'Content-Type':'application/json', Prefer:'return=representation' }, body: JSON.stringify({ job_id:jobId, bucket_id:BUCKET, object_path:objectPath, original_filename:safeName(image.name), mime_type:mimeType, byte_size:bytes.length, uploaded_by_email:actorEmail }) });
    if (!saved.response.ok) throw new Error(saved.data?.message || 'Metadata save failed');
    return send(res, 201, { message: 'อัปโหลดรูปภาพเรียบร้อยแล้ว', attachment: saved.data?.[0] });
  } catch (error) {
    if (objectPath) { const encoded = objectPath.split('/').map(encodeURIComponent).join('/'); await serviceSupabase(`/storage/v1/object/${BUCKET}/${encoded}`, { method:'DELETE' }).catch(() => {}); }
    console.error('[maintenance-image]', error);
    return send(res, 503, { message: 'ไม่สามารถอัปโหลดรูปภาพได้' });
  }
};
