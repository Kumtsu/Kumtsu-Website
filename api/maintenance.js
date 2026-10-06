const { currentUser, readJson, send, serviceSupabase } = require('./_internal-auth');

const ADMIN_EMAILS = new Set(['uthumporn.p@kumtsu.com', 'pachara.r@kumtsu.com']);
const STATUSES = new Set(['waiting', 'progress', 'overdue', 'approval', 'completed', 'cancelled']);
const TECHNICIANS = new Set(['นอส', 'เอฟ', 'ขวัญ']);
const OTHER_BRANCH = 'สาขาอื่นๆ';
const BRANCHES = new Set([
  'สุขุมวิท 31', 'ราชเทวี', 'สาทร', 'เกษตร', 'ปิ่นเกล้า', 'โชคชัย 4', 'อารีย์', 'รัชดา', 'อ่อนนุช', 'สามัคคี',
  'หัวหมาก', 'รัตนาธิเบศร์ 22', 'วงเวียนใหญ่', 'แบริ่ง', 'ศรีนครินทร์', 'พัฒนาการ', 'บางแค', 'เพชรเกษม48', 'สรงประภา', 'ราชพฤกษ์-สวนผัก32',
  'ประชาอุทิศ', 'เคหะร่มเกล้า', 'เมืองเอก', 'ลาดกระบัง', 'ศาลายา', 'สายลม', 'ธรรมศาสตร์ รังสิต', 'ลาดพร้าว101', 'เยาวราช(franchise)', 'พระราม5(franchise)',
  'กาดรวมโชค', 'สถานีรถไฟเชียงใหม่', 'นิมมาน', 'หน้าเมือง', 'กังสดาล', 'โคราช', 'พระราม 9', 'อุดร', 'ประชาชื่น 36', 'แจ้งวัฒนะ - ปากเกร็ด 36',
  'บางแสน', 'บางพลี(franchise)', 'เพชรเกษม 69(franchise)', 'ยิ่งเจริญ', 'มมส.(franchise)', 'พระราม 3', 'สามย่าน', 'ลาดปลาเค้า', 'สนามจันทร์', 'รังสิต คลอง 3',
]);
BRANCHES.add('สำนักงานใหญ่');
const JOB_FIELDS = 'id,branch,job_type,scheduled_date,scheduled_time,assigned_to,title,description,status,created_by_email,updated_by_email,created_at,updated_at';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

async function activeProfile(auth) {
  const { response, data } = await serviceSupabase(
    `/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=user_id,employee_id,first_name,last_name,email,status`,
    { headers: { Accept: 'application/json' } },
  );
  return response.ok ? data?.[0] : null;
}

async function loadJobs() {
  const { response, data } = await serviceSupabase(
    `/rest/v1/maintenance_jobs?select=${JOB_FIELDS}&order=scheduled_date.asc,scheduled_time.asc,created_at.asc`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(data?.message || 'Unable to load maintenance jobs');
  return data || [];
}

async function loadAttachments() {
  const { response, data } = await serviceSupabase('/rest/v1/maintenance_job_attachments?select=id,job_id,bucket_id,object_path,original_filename,mime_type,byte_size,uploaded_by_email,created_at&order=created_at.asc');
  if (!response.ok) throw new Error(data?.message || 'Unable to load close-out images');
  return data || [];
}

async function signedImage(attachment) {
  const encodedPath = attachment.object_path.split('/').map(encodeURIComponent).join('/');
  const { response, data } = await serviceSupabase(`/storage/v1/object/sign/${encodeURIComponent(attachment.bucket_id)}/${encodedPath}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }),
  });
  return response.ok ? { ...attachment, signed_url: data.signedURL || data.signedUrl || '' } : { ...attachment, signed_url: '' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });

  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนดูข้อมูลงานช่าง' });
    const profile = await activeProfile(auth);
    if (!profile || profile.status !== 'active') return send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });

    const email = normalizeEmail(auth.user.email || profile.email);
    const canManage = ADMIN_EMAILS.has(email);
    if (req.method === 'GET') {
      const techResult = await serviceSupabase(`/rest/v1/maintenance_technicians?email=eq.${encodeURIComponent(email)}&active=eq.true&select=technician_key`);
      const technicianKey = techResult.response.ok ? techResult.data?.[0]?.technician_key || null : null;
      const jobs = await loadJobs();
      const attachments = await loadAttachments();
      const signed = await Promise.all(attachments.map(signedImage));
      const byJob = signed.reduce((result, item) => { (result[item.job_id] ||= []).push(item); return result; }, {});
      return send(res, 200, {
        profile,
        permissions: { canManage, technicianKey },
        jobs: jobs.map((job) => ({ ...job, closeout_images: byJob[job.id] || [] })),
      });
    }

    if (!canManage) return send(res, 403, { message: 'คุณไม่มีสิทธิ์เปิดงานหรือปรับสถานะงาน' });
    const body = await readJson(req);

    if (req.method === 'POST') {
      const requestedBranch = String(body.branch || '').trim();
      const customBranch = String(body.customBranch || '').trim();
      const isOtherBranch = requestedBranch === OTHER_BRANCH;
      const branch = cleanText(isOtherBranch ? customBranch : requestedBranch, 120);
      const jobType = cleanText(body.jobType, 120);
      const scheduledDate = cleanText(body.scheduledDate, 10);
      const scheduledTime = cleanText(body.scheduledTime, 5);
      const title = cleanText(body.title, 180);
      const description = cleanText(body.description, 4000);
      const assignedTo = Array.isArray(body.assignedTo)
        ? body.assignedTo.map((value) => cleanText(value, 120)).filter(Boolean).slice(0, 10)
        : [];
      const validBranch = isOtherBranch
        ? Boolean(customBranch) && customBranch.length <= 120
        : BRANCHES.has(branch);
      if (!validBranch || !jobType || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime) || !assignedTo.length || assignedTo.some((value) => !TECHNICIANS.has(value)) || !title) {
        return send(res, 400, { message: 'กรุณากรอกสาขา ประเภทงาน วันที่ เวลา ช่างผู้รับผิดชอบ และหัวข้องานให้ถูกต้อง' });
      }

      const result = await serviceSupabase('/rest/v1/maintenance_jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          branch,
          job_type: jobType,
          scheduled_date: scheduledDate,
          scheduled_time: scheduledTime,
          assigned_to: assignedTo,
          title,
          description,
          status: 'waiting',
          created_by_email: email,
          updated_by_email: email,
        }),
      });
      if (!result.response.ok) throw new Error(result.data?.message || 'Unable to create maintenance job');
      return send(res, 201, { message: 'เปิดงานใหม่เรียบร้อยแล้ว', job: result.data?.[0] });
    }

    const id = Number(body.id);
    if (body.action === 'edit') {
      const requestedBranch = String(body.branch || '').trim();
      const customBranch = String(body.customBranch || '').trim();
      const isOtherBranch = requestedBranch === OTHER_BRANCH;
      const branch = cleanText(isOtherBranch ? customBranch : requestedBranch, 120);
      const jobType = cleanText(body.jobType, 120);
      const scheduledDate = cleanText(body.scheduledDate, 10);
      const scheduledTime = cleanText(body.scheduledTime, 5);
      const title = cleanText(body.title, 180);
      const description = cleanText(body.description, 4000);
      const assignedTo = Array.isArray(body.assignedTo) ? body.assignedTo.map((value) => cleanText(value, 120)).filter(Boolean).slice(0, 10) : [];
      const validBranch = isOtherBranch ? Boolean(customBranch) && customBranch.length <= 120 : BRANCHES.has(branch);
      if (!Number.isSafeInteger(id) || id < 1 || !validBranch || !jobType || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime) || !assignedTo.length || assignedTo.some((value) => !TECHNICIANS.has(value)) || !title) {
        return send(res, 400, { message: 'กรุณากรอกข้อมูลงานที่แก้ไขให้ถูกต้อง' });
      }
      const edited = await serviceSupabase(`/rest/v1/maintenance_jobs?id=eq.${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ branch, job_type: jobType, scheduled_date: scheduledDate, scheduled_time: scheduledTime, assigned_to: assignedTo, title, description, updated_by_email: email, updated_at: new Date().toISOString() }),
      });
      if (!edited.response.ok) throw new Error(edited.data?.message || 'Unable to edit maintenance job');
      if (!edited.data?.[0]) return send(res, 404, { message: 'ไม่พบงานที่ต้องการแก้ไข' });
      return send(res, 200, { message: 'แก้ไขข้อมูลงานเรียบร้อยแล้ว', job: edited.data[0] });
    }
    const status = String(body.status || '');
    if (status === 'completed') return send(res, 400, { message: 'กรุณาปิดงานพร้อมรูปภาพหลักฐาน' });
    if (!Number.isSafeInteger(id) || id < 1 || !STATUSES.has(status)) {
      return send(res, 400, { message: 'ข้อมูลงานหรือสถานะไม่ถูกต้อง' });
    }
    const result = await serviceSupabase(`/rest/v1/maintenance_jobs?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ status, updated_by_email: email, updated_at: new Date().toISOString() }),
    });
    if (!result.response.ok) throw new Error(result.data?.message || 'Unable to update maintenance status');
    if (!result.data?.[0]) return send(res, 404, { message: 'ไม่พบงานที่ต้องการแก้ไข' });
    return send(res, 200, { message: 'อัปเดตสถานะเรียบร้อยแล้ว', job: result.data[0] });
  } catch (error) {
    console.error('[maintenance]', error);
    return send(res, 503, { message: 'ระบบงานช่างขัดข้องชั่วคราว' });
  }
};
