const crypto = require('node:crypto');
const { currentUser, readJson, send, serviceSupabase } = require('./_internal-auth');

const ADMIN_EMAILS = new Set(['uthumporn.p@kumtsu.com', 'pachara.r@kumtsu.com']);
const MIME_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BUCKET = 'maintenance-closeouts';

function email(value) { return String(value || '').trim().toLowerCase(); }
function safeName(value) { return String(value || 'image').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'image'; }
function hasImageSignature(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}
async function removeObject(path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  await serviceSupabase(`/storage/v1/object/${BUCKET}/${encoded}`, { method: 'DELETE' });
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
    if (!Number.isSafeInteger(jobId) || jobId < 1) return send(res, 400, { message: 'ข้อมูลงานไม่ถูกต้อง' });

    const jobResult = await serviceSupabase(`/rest/v1/maintenance_jobs?id=eq.${jobId}&select=*`);
    const job = jobResult.response.ok ? jobResult.data?.[0] : null;
    if (!job || ['completed', 'cancelled'].includes(job.status)) return send(res, 409, { message: 'ไม่พบงานหรืองานสิ้นสุดแล้ว' });
    let authorized = ADMIN_EMAILS.has(actorEmail);
    if (!authorized) {
      const techResult = await serviceSupabase(`/rest/v1/maintenance_technicians?email=eq.${encodeURIComponent(actorEmail)}&active=eq.true&select=technician_key`);
      const technicianKey = techResult.response.ok ? techResult.data?.[0]?.technician_key : null;
      authorized = Boolean(technicianKey && (job.assigned_to || []).includes(technicianKey));
    }
    if (!authorized) return send(res, 403, { message: 'คุณไม่มีสิทธิ์ปิดงานนี้' });

    const attachments = await serviceSupabase(`/rest/v1/maintenance_job_attachments?job_id=eq.${jobId}&select=id&limit=1`);
    if (!attachments.response.ok || !attachments.data?.length) return send(res, 400, { message: 'กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปก่อนปิดงาน' });
    const finalized = await serviceSupabase('/rest/v1/rpc/complete_maintenance_job', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        p_job_id: jobId, p_actor_email: actorEmail,
      }),
    });
    if (!finalized.response.ok || !finalized.data?.[0]) throw new Error(finalized.data?.message || 'Close transaction failed');
    return send(res, 200, { message: 'ปิดงานพร้อมบันทึกรูปภาพเรียบร้อยแล้ว', job: finalized.data[0] });
  } catch (error) {
    if (objectPath) await removeObject(objectPath).catch(() => {});
    console.error('[maintenance-close]', error);
    return send(res, 503, { message: 'ไม่สามารถอัปโหลดรูปและปิดงานได้' });
  }
};

module.exports._test = { email, hasImageSignature, safeName };
