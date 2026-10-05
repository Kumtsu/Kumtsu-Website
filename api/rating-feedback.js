const { currentUser, readJson, send, serviceSupabase, supabase } = require('./_internal-auth');
const dashboardData = require('./_rating-feedback-data.json');

const STATUSES = new Set(['none', 'needs_improvement', 'in_progress', 'resolved']);

function assignmentsFor(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return dashboardData.areaManagers.filter((entry) => entry.email.toLowerCase() === normalized);
}

function canEdit(email, branch) {
  return assignmentsFor(email).some((entry) => entry.active !== false
    && (entry.branch === '*' || entry.role === 'operations_manager' || entry.branch === branch));
}

function issueMap(rows) {
  return Object.fromEntries((rows || []).map((row) => [row.review_id, {
    status: row.status, updatedAt: row.updated_at, updatedBy: row.updated_by_email,
  }]));
}

async function activeProfile(auth) {
  const { response, data } = await supabase(
    `/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=employee_id,first_name,last_name,email,status`,
    { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' } },
  );
  return response.ok ? data?.[0] : null;
}

async function loadIssues() {
  const { response, data } = await serviceSupabase(
    '/rest/v1/rfd_feedback_workflow?select=review_id,status,updated_at,updated_by_email',
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) throw new Error(data?.message || 'Unable to load feedback workflow');
  return issueMap(data);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!['GET', 'PUT'].includes(req.method)) return send(res, 405, { message: 'Method not allowed' });
  try {
    const auth = await currentUser(req);
    if (!auth) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนดูข้อมูลภายใน' });
    const profile = await activeProfile(auth);
    if (!profile || profile.status !== 'active') return send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });

    if (req.method === 'GET') {
      return send(res, 200, { user: { id: auth.user.id, email: auth.user.email }, profile, issues: await loadIssues(), ...dashboardData });
    }

    const body = await readJson(req);
    const reviewId = String(body.reviewId || '');
    const status = String(body.status || '');
    const review = dashboardData.records.find((item) => item.id === reviewId);
    if (!review || !STATUSES.has(status)) return send(res, 400, { message: 'ข้อมูลสถานะไม่ถูกต้อง' });
    if (!canEdit(auth.user.email || profile.email, review.branch)) return send(res, 403, { message: 'คุณไม่มีสิทธิ์แก้ไขสถานะของสาขานี้' });

    if (status === 'none') {
      const result = await serviceSupabase(`/rest/v1/rfd_feedback_workflow?review_id=eq.${encodeURIComponent(reviewId)}`, { method: 'DELETE' });
      if (!result.response.ok) throw new Error(result.data?.message || 'Unable to clear workflow status');
      return send(res, 200, { issue: null });
    }

    const previousResult = await serviceSupabase(`/rest/v1/rfd_feedback_workflow?review_id=eq.${encodeURIComponent(reviewId)}&select=status`, { headers: { Accept: 'application/json' } });
    const previousStatus = previousResult.response.ok ? previousResult.data?.[0]?.status || null : null;
    const jsonHeaders = { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' };
    const reviewResult = await serviceSupabase('/rest/v1/rfd_reviews?on_conflict=review_id', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({
        review_id: review.id, store_id: review.storeId, store_name: review.storeName,
        brand: review.brand, branch: review.branch, review_text: review.review,
        service_type: review.serviceType, rating: review.rating, reply_text: review.reply,
        customer_name: review.customer, visibility: review.visibility,
        reviewed_at: review.date, region: review.region,
      }),
    });
    if (!reviewResult.response.ok) throw new Error(reviewResult.data?.message || 'Unable to sync review');

    const now = new Date().toISOString();
    const actor = String(auth.user.email || profile.email || '').toLowerCase();
    const workflowResult = await serviceSupabase('/rest/v1/rfd_feedback_workflow?on_conflict=review_id', {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ review_id: reviewId, status, updated_at: now, updated_by_email: actor }),
    });
    if (!workflowResult.response.ok) throw new Error(workflowResult.data?.message || 'Unable to save workflow status');

    if (previousStatus !== status) {
      const historyResult = await serviceSupabase('/rest/v1/rfd_feedback_workflow_history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, from_status: previousStatus, to_status: status, changed_at: now, changed_by_email: actor }),
      });
      if (!historyResult.response.ok) throw new Error(historyResult.data?.message || 'Unable to save workflow history');
    }
    return send(res, 200, { issue: { status, updatedAt: now, updatedBy: actor } });
  } catch (error) {
    console.error('[rating-feedback]', error);
    return send(res, 503, { message: 'ไม่สามารถบันทึกข้อมูล Rating & Feedback ได้' });
  }
};
