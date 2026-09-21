const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const attempts = new Map();
const { serviceSupabase } = require('./_internal-auth');

function clean(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return clean(Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0], 64) || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ message: 'ส่งคำขอบ่อยเกินไป กรุณารอประมาณ 15 นาทีแล้วลองใหม่' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (_) {
    return res.status(400).json({ message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  }
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const department = clean(body.department, 100);
  const employeeId = clean(body.employeeId, 30);
  const email = clean(body.email, 160).toLowerCase();
  const phone = clean(body.phone, 20);
  const website = clean(body.website, 200);
  const startedAt = Number(body.startedAt || 0);
  const consent = body.consent === true;

  if (website) {
    return res.status(200).json({ message: 'ส่งคำขอเรียบร้อยแล้ว' });
  }

  if (!firstName || !lastName || !department || !employeeId || !email || !consent) {
    return res.status(400).json({ message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
  }

  if (!/^[^\s@]+@kumtsu\.com$/i.test(email)) {
    return res.status(400).json({ message: 'กรุณาใช้อีเมลองค์กร @kumtsu.com' });
  }

  if (startedAt && Date.now() - startedAt < 2500) {
    return res.status(400).json({ message: 'กรุณาตรวจสอบข้อมูลแล้วส่งคำขออีกครั้ง' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('[internal-register] RESEND_API_KEY is not configured');
    return res.status(503).json({ message: 'ระบบอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อฝ่าย IT' });
  }

  const submittedAt = new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long', timeStyle: 'medium', timeZone: 'Asia/Bangkok',
  }).format(new Date());
  const safe = Object.fromEntries(Object.entries({ firstName, lastName, department, employeeId, email, phone, submittedAt }).map(([key, value]) => [key, escapeHtml(value)]));
  const recipients = [...new Set([
    'pachara.r@kumtsu.com',
    'account.it@kumtsu.com',
    ...(process.env.INTERNAL_EMAIL_TO || '').split(',').map((value) => value.trim()).filter(Boolean),
  ])];
  const from = process.env.APPROVAL_EMAIL_FROM || 'Kumtsu Admin <account.it@kumtsu.com>';
  const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://www.kumtsu.com').replace(/\/$/, '');

  const requestResult = await serviceSupabase('/rest/v1/internal_member_requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      first_name: firstName, last_name: lastName, department, employee_id: employeeId,
      email, phone: phone || null, status: 'pending', notification_status: 'pending',
    }),
  });
  if (!requestResult.response.ok) {
    const duplicate = requestResult.response.status === 409 || String(requestResult.data?.code || '') === '23505';
    return res.status(duplicate ? 409 : 502).json({
      message: duplicate ? 'อีเมลหรือรหัสพนักงานนี้มีคำขออยู่ในระบบแล้ว' : 'ไม่สามารถบันทึกคำขอได้ กรุณาลองใหม่อีกครั้ง',
    });
  }
  const requestId = requestResult.data[0].id;

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `internal-${employeeId}-${Date.now()}`,
    },
    body: JSON.stringify({
      from,
      to: recipients,
      reply_to: email,
      subject: `คำขอเข้าใช้งานระบบภายใน — ${firstName} ${lastName} (${employeeId})`,
      html: `
        <div style="background:#f3f5f3;padding:32px;font-family:Arial,'Noto Sans Thai',sans-serif;color:#172017">
          <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #dfe5df;border-radius:14px;overflow:hidden">
            <div style="background:#101410;padding:24px 28px;color:#fff"><div style="color:#39c66c;font-size:12px;font-weight:700;letter-spacing:2px">KUMTSU INTERNAL</div><h1 style="margin:8px 0 0;font-size:24px">คำขอเข้าใช้งานระบบภายใน</h1></div>
            <div style="padding:28px">
              <p style="margin-top:0">มีพนักงานส่งคำขอเข้าใช้งานระบบ กรุณาตรวจสอบรายละเอียดดังต่อไปนี้</p>
              <table style="width:100%;border-collapse:collapse;font-size:15px">
                <tr><td style="padding:10px;border-bottom:1px solid #e8ece8;color:#687068">ชื่อ–นามสกุล</td><td style="padding:10px;border-bottom:1px solid #e8ece8;font-weight:700">${safe.firstName} ${safe.lastName}</td></tr>
                <tr><td style="padding:10px;border-bottom:1px solid #e8ece8;color:#687068">แผนก</td><td style="padding:10px;border-bottom:1px solid #e8ece8">${safe.department}</td></tr>
                <tr><td style="padding:10px;border-bottom:1px solid #e8ece8;color:#687068">รหัสพนักงาน</td><td style="padding:10px;border-bottom:1px solid #e8ece8">${safe.employeeId}</td></tr>
                <tr><td style="padding:10px;border-bottom:1px solid #e8ece8;color:#687068">อีเมล</td><td style="padding:10px;border-bottom:1px solid #e8ece8"><a href="mailto:${safe.email}" style="color:#168541">${safe.email}</a></td></tr>
                <tr><td style="padding:10px;border-bottom:1px solid #e8ece8;color:#687068">เบอร์โทรศัพท์</td><td style="padding:10px;border-bottom:1px solid #e8ece8">${safe.phone || 'ไม่ได้ระบุ'}</td></tr>
                <tr><td style="padding:10px;color:#687068">วันเวลาที่สมัคร</td><td style="padding:10px">${safe.submittedAt}</td></tr>
              </table>
              <p style="margin:26px 0 0"><a href="${siteUrl}/internal/admin/" style="display:inline-block;background:#1ca650;color:#071109;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">เปิดหน้าตรวจสอบคำขอ</a></p>
            </div>
          </div>
        </div>`,
    }),
  });

  const emailResult = await emailResponse.json().catch(() => ({}));
  if (!emailResponse.ok) {
    await serviceSupabase(`/rest/v1/internal_member_requests?id=eq.${encodeURIComponent(requestId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notification_status: 'failed' }),
    });
    console.error('[internal-register] Resend error', { status: emailResponse.status, error: emailResult });
    return res.status(202).json({ message: 'บันทึกคำขอแล้ว แต่การแจ้งอีเมลขัดข้อง ฝ่าย IT สามารถตรวจสอบคำขอในระบบหลังบ้านได้' });
  }

  await serviceSupabase(`/rest/v1/internal_member_requests?id=eq.${encodeURIComponent(requestId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notification_status: 'sent' }),
  });

  console.log('[internal-register] request sent', { employeeId, emailId: emailResult.id });
  return res.status(200).json({ message: 'ส่งคำขอเรียบร้อยแล้ว ฝ่าย IT จะตรวจสอบและติดต่อกลับทางอีเมล' });
}
