const { randomUUID } = require('node:crypto');
const { currentUser, readJson, send, serviceSupabase, supabase, env } = require('./_internal-auth');
const dashboardData = require('./_rating-feedback-data.json');

const APPROVER = 'sittichok.s@kumtsu.com';
const BUCKET = 'rfd-feedback-evidence';
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_EVIDENCE = 5;
const EDITABLE_STATUSES = new Set(['none', 'needs_improvement', 'in_progress']);
const ACTIONS = new Set(['set_status', 'save_progress', 'submit', 'approve', 'return']);
const WORKFLOW_FIELDS = 'review_id,status,updated_at,updated_by_email,action_plan,action_result,evidence,revision,submitted_at,submitted_by_email,approved_at,approved_by_email,return_reason';
const EXTRA_ADMIN_ASSIGNMENTS = [
  { branch: '*', email: 'pachara.r@kumtsu.com', name: 'พัชระ รัตนเขมากร', role: 'operations_manager' },
  { branch: '*', email: 'krissana.s@kumtsu.com', name: 'krissana.s@kumtsu.com', role: 'operations_manager' },
];
const areaManagers = [...dashboardData.areaManagers, ...EXTRA_ADMIN_ASSIGNMENTS];
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function canEdit(email, branch) {
  return areaManagers.some((entry) => normalizeEmail(entry.email) === email && entry.active !== false
    && (entry.branch === '*' || entry.role === 'operations_manager' || entry.branch === branch));
}

function publicEvidence(item) {
  return {
    id: item.id, name: item.name, mimeType: item.mimeType, size: item.size,
    uploadedAt: item.uploadedAt, uploadedBy: item.uploadedBy,
  };
}

function issue(row) {
  return {
    status: row.status, updatedAt: row.updated_at, updatedBy: row.updated_by_email,
    actionPlan: row.action_plan || '', actionResult: row.action_result || '',
    evidence: (Array.isArray(row.evidence) ? row.evidence : []).map(publicEvidence),
    revision: row.revision || 0, submittedAt: row.submitted_at, submittedBy: row.submitted_by_email,
    approvedAt: row.approved_at, approvedBy: row.approved_by_email, returnReason: row.return_reason || '',
  };
}

async function activeProfile(auth) {
  const { response, data } = await supabase(
    '/rest/v1/internal_profiles?user_id=eq.' + encodeURIComponent(auth.user.id) + '&select=employee_id,first_name,last_name,email,status',
    { headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json' } },
  );
  return response.ok ? data?.[0] : null;
}

async function workflows(reviewId) {
  const filter = reviewId ? '&review_id=eq.' + encodeURIComponent(reviewId) : '';
  const { response, data } = await serviceSupabase('/rest/v1/rfd_feedback_workflow?select=' + WORKFLOW_FIELDS + filter);
  if (!response.ok || !Array.isArray(data)) throw new Error('Unable to load feedback workflow');
  return data;
}

function textField(value, name, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > max) throw new RequestError(400, name + 'ยาวเกินกำหนดหรือรูปแบบไม่ถูกต้อง');
  return value.trim();
}

function revisionMatches(row, expected) {
  if (!Number.isSafeInteger(expected) || expected < 0) throw new RequestError(400, 'กรุณาโหลดรายการล่าสุดก่อนบันทึก');
  if ((row?.revision || 0) !== expected) throw new RequestError(409, 'รายการนี้มีผู้อื่นอัปเดตแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
}

function rpcError(data) {
  const message = String(data?.message || '');
  if (/^conflict:/i.test(message)) return new RequestError(409, 'รายการนี้เปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
  if (/^forbidden:/i.test(message)) return new RequestError(403, 'คุณไม่มีสิทธิ์ดำเนินการนี้');
  if (/^invalid:/i.test(message)) return new RequestError(400, 'ข้อมูลไม่ครบหรือไม่ตรงกับสถานะปัจจุบัน กรุณาตรวจรายละเอียดอีกครั้ง');
  return new Error('Unable to save feedback workflow');
}

async function applyAction(reviewId, actor, body, evidence = null) {
  const { response, data } = await serviceSupabase('/rest/v1/rpc/rfd_apply_feedback_action', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_review_id: reviewId, p_actor_email: actor, p_expected_revision: body.expectedRevision,
      p_action: body.action, p_status: body.status || null,
      p_plan: body.plan ?? null, p_result: body.result ?? null, p_reason: body.reason ?? null,
      p_evidence: evidence,
    }),
  });
  if (!response.ok) throw rpcError(data);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.review_id) throw new Error('Invalid feedback workflow response');
  return issue(row);
}

async function syncReview(review) {
  const { response } = await serviceSupabase('/rest/v1/rfd_reviews?on_conflict=review_id', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      review_id: review.id, store_id: review.storeId, store_name: review.storeName,
      brand: review.brand, branch: review.branch, review_text: review.review,
      service_type: review.serviceType, rating: review.rating, reply_text: review.reply,
      customer_name: review.customer, visibility: review.visibility, reviewed_at: review.date, region: review.region,
    }),
  });
  if (!response.ok) throw new Error('Unable to sync review');
}

function queryParams(req) {
  const params = new URL(req.url || '/api/rating-feedback', 'https://kumtsu.invalid').searchParams;
  for (const [key, value] of Object.entries(req.query || {})) {
    if (typeof value === 'string') params.set(key, value);
  }
  return params;
}

function imageFile(body) {
  const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = formats[body.mimeType];
  const base64 = body.data;
  if (!extension || typeof base64 !== 'string' || !base64.length
    || base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new RequestError(400, 'รองรับรูป JPEG, PNG หรือ WebP ขนาดไม่เกิน 2 MB ต่อรูป');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== base64) {
    throw new RequestError(400, 'รูปภาพไม่ถูกต้องหรือขนาดเกิน 2 MB');
  }
  const valid = body.mimeType === 'image/jpeg'
    ? bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : body.mimeType === 'image/png'
      ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new RequestError(400, 'เนื้อหาไฟล์ไม่ตรงกับชนิดรูปภาพที่เลือก');
  const name = typeof body.fileName === 'string'
    ? body.fileName.replace(/[\x00-\x1f\x7f/\\]/g, '_').trim().slice(0, 160) : '';
  return { bytes, extension, name: name || 'evidence.' + extension };
}

async function imageUrl(reviewId, imageId) {
  const row = (await workflows(reviewId))[0];
  const attachment = (Array.isArray(row?.evidence) ? row.evidence : []).find((entry) => entry.id === imageId);
  if (!attachment || typeof attachment.path !== 'string' || !attachment.path.startsWith(reviewId + '/')) {
    throw new RequestError(404, 'ไม่พบรูปหลักฐานในรายการนี้');
  }
  const { response, data } = await serviceSupabase('/storage/v1/object/sign/' + BUCKET + '/' + encodedPath(attachment.path), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }),
  });
  const signed = data?.signedURL || data?.signedUrl;
  if (!response.ok || typeof signed !== 'string' || !signed) throw new Error('Unable to access evidence');
  const base = env().url + '/storage/v1/';
  const url = new URL(signed.replace(/^\/storage\/v1\//, '').replace(/^\//, ''), base);
  if (url.origin !== new URL(env().url).origin || !url.pathname.startsWith('/storage/v1/object/sign/' + BUCKET + '/')) throw new Error('Invalid evidence URL');
  return url.href;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนดูข้อมูลภายใน' });
    const profile = await activeProfile(auth);
    if (!profile || profile.status !== 'active') return send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });
    // Authorization always comes from the verified Auth identity, never an email supplied in the body/profile.
    const actor = normalizeEmail(auth.user.email);
    const canApprove = actor === APPROVER;

    if (req.method === 'GET') {
      const params = queryParams(req);
      const reviewId = params.get('reviewId');
      if (reviewId || params.has('imageId') || params.has('history')) {
        if (!reviewId || !dashboardData.records.some((entry) => entry.id === reviewId)) throw new RequestError(404, 'ไม่พบรายการรีวิว');
        if (params.has('imageId')) return send(res, 200, { url: await imageUrl(reviewId, params.get('imageId')) });
        if (params.get('history') === '1') {
          const { response, data } = await serviceSupabase('/rest/v1/rfd_feedback_workflow_history?review_id=eq.' + encodeURIComponent(reviewId) + '&select=from_status,to_status,note,changed_at,changed_by_email&order=changed_at.asc,id.asc');
          if (!response.ok || !Array.isArray(data)) throw new Error('Unable to load feedback history');
          const history = data.map((entry) => {
            let note = entry.note;
            try { note = JSON.parse(note); } catch (_) { /* Older history notes are plain text. */ }
            return { fromStatus: entry.from_status, toStatus: entry.to_status, note, changedAt: entry.changed_at, changedBy: entry.changed_by_email };
          });
          return send(res, 200, { history });
        }
        return send(res, 400, { message: 'คำขอรายละเอียดไม่ถูกต้อง' });
      }
      const rows = await workflows();
      return send(res, 200, {
        ...dashboardData, areaManagers, user: { id: auth.user.id, email: auth.user.email }, profile,
        issues: Object.fromEntries(rows.map((row) => [row.review_id, issue(row)])), permissions: { canApprove },
      });
    }

    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
    const reviewId = typeof body.reviewId === 'string' ? body.reviewId : '';
    const review = dashboardData.records.find((entry) => entry.id === reviewId);
    if (!review) throw new RequestError(400, 'ไม่พบรายการรีวิว');
    const action = typeof body.action === 'string' ? body.action : 'set_status';
    if ((req.method === 'POST' && action !== 'upload_evidence') || (req.method === 'PUT' && !ACTIONS.has(action))) {
      throw new RequestError(400, 'คำสั่งดำเนินการไม่ถูกต้อง');
    }
    if ((action === 'approve' || action === 'return') && !canApprove) throw new RequestError(403, 'เฉพาะคุณสิทธิโชคเท่านั้นที่อนุมัติหรือส่งกลับแก้ไขได้');
    if (!canEdit(actor, review.branch) && !((action === 'approve' || action === 'return') && canApprove)) {
      throw new RequestError(403, 'คุณไม่มีสิทธิ์แก้ไขรายการของสาขานี้');
    }
    if (action === 'set_status' && (body.status === 'resolved' || body.status === 'pending_approval')) {
      throw new RequestError(403, 'กรุณาส่งตรวจและให้คุณสิทธิโชคอนุมัติก่อนปิดงาน');
    }
    if (action === 'set_status' && !EDITABLE_STATUSES.has(body.status)) throw new RequestError(400, 'สถานะไม่ถูกต้อง');
    if (action === 'set_status' && body.status === 'none' && !canApprove) throw new RequestError(403, 'เฉพาะคุณสิทธิโชคเท่านั้นที่ยกเลิกการติดตามได้');

    const current = (await workflows(reviewId))[0];
    revisionMatches(current, body.expectedRevision);
    if (!current && action !== 'set_status') throw new RequestError(400, 'กรุณาเริ่มติดตามรายการก่อนบันทึกการดำเนินการ');
    if (current?.status === 'pending_approval' && !['approve', 'return'].includes(action)) {
      throw new RequestError(409, 'รายการอยู่ระหว่างรอคุณสิทธิโชคตรวจ กรุณารอผลอนุมัติ');
    }
    if (current?.status === 'resolved' && !(canApprove && action === 'set_status' && body.status === 'needs_improvement')) {
      throw new RequestError(409, 'รายการอนุมัติเสร็จสิ้นแล้ว ให้คุณสิทธิโชคเปิดติดตามใหม่ก่อนแก้ไข');
    }
    if (['approve', 'return'].includes(action) && current?.status !== 'pending_approval') throw new RequestError(409, 'รายการนี้ยังไม่ได้ส่งตรวจ');
    if (current?.status === 'none' && action !== 'set_status') throw new RequestError(409, 'กรุณาเปิดติดตามรายการก่อนบันทึก');

    if (req.method === 'POST') {
      const previousEvidence = Array.isArray(current?.evidence) ? current.evidence : [];
      if (previousEvidence.length >= MAX_EVIDENCE) throw new RequestError(400, 'แนบหลักฐานได้สูงสุด 5 รูปต่อรายการ');
      const file = imageFile(body);
      const id = randomUUID();
      const path = reviewId + '/' + id + '.' + file.extension;
      const uploaded = await serviceSupabase('/storage/v1/object/' + BUCKET + '/' + encodedPath(path), {
        method: 'POST', headers: { 'Content-Type': body.mimeType, 'x-upsert': 'false' }, body: file.bytes,
      });
      if (!uploaded.response.ok) throw new Error('Unable to upload evidence');
      const evidence = { id, path, name: file.name, mimeType: body.mimeType, size: file.bytes.length, uploadedAt: new Date().toISOString(), uploadedBy: actor };
      // If a concurrent edit wins after upload, the private object remains unlinked and is never exposed as saved evidence.
      const result = await applyAction(reviewId, actor, { action: 'add_evidence', expectedRevision: body.expectedRevision }, evidence);
      return send(res, 200, { issue: result });
    }

    const plan = textField(body.plan, 'แผนดำเนินการ', 4000);
    const result = textField(body.result, 'ผลดำเนินการ', 4000);
    const reason = textField(body.reason, 'เหตุผลส่งกลับ', 2000);
    if (action === 'save_progress' && !(plan ?? current?.action_plan ?? '').trim() && !(result ?? current?.action_result ?? '').trim()) {
      throw new RequestError(400, 'กรุณากรอกแผนหรือผลดำเนินการก่อนบันทึก');
    }
    if (action === 'submit' && (!(result ?? current?.action_result ?? '').trim() || !current?.evidence?.length)) {
      throw new RequestError(400, 'กรุณากรอกผลดำเนินการและแนบรูปหลักฐานก่อนส่งตรวจ');
    }
    if (action === 'return' && !reason) throw new RequestError(400, 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
    if (!current) await syncReview(review);
    const updated = await applyAction(reviewId, actor, {
      action, expectedRevision: body.expectedRevision, status: action === 'set_status' ? body.status : null,
      plan: ['save_progress', 'submit'].includes(action) ? plan : null,
      result: ['save_progress', 'submit'].includes(action) ? result : null,
      reason: action === 'return' ? reason : null,
    });
    return send(res, 200, { issue: updated });
  } catch (error) {
    if (error instanceof RequestError) return send(res, error.status, { message: error.message });
    if (error instanceof SyntaxError) return send(res, 400, { message: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    console.error('[rating-feedback]', error.message);
    return send(res, 503, { message: 'ไม่สามารถบันทึกหรือโหลดข้อมูล Rating & Feedback ได้ กรุณาลองใหม่' });
  }
};
