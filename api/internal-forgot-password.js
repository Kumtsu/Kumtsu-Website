const { readJson, send, serviceSupabase } = require('./_internal-auth');

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const attempts = new Map();

function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });

  if (isRateLimited(getClientIp(req))) {
    return send(res, 429, { message: 'ส่งคำขอบ่อยเกินไป กรุณารอประมาณ 15 นาทีแล้วลองใหม่' });
  }

  const genericMessage = 'หากอีเมลนี้มีบัญชี ระบบได้ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว';

  try {
    const { email = '' } = await readJson(req);
    const normalized = clean(email, 160).toLowerCase();
    if (!/^[^\s@]+@kumtsu\.com$/i.test(normalized)) {
      return send(res, 400, { message: 'กรุณาใช้อีเมล @kumtsu.com' });
    }

    if (!process.env.RESEND_API_KEY) {
      console.error('[internal-forgot-password] RESEND_API_KEY is not configured');
      return send(res, 503, { message: 'ระบบอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อฝ่าย IT' });
    }

    const origin = (process.env.PUBLIC_SITE_URL || 'https://www.kumtsu.com').replace(/\/$/, '');
    const redirectTo = `${origin}/internal/reset-password.html`;
    const { response: linkResponse, data: linkData } = await serviceSupabase('/auth/v1/admin/generate_link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recovery', email: normalized, redirect_to: redirectTo }),
    });

    // Keep the public response generic so the form cannot be used to enumerate employees.
    if (!linkResponse.ok) {
      const errorMessage = String(linkData?.message || linkData?.msg || '');
      const isMissingUser = linkResponse.status === 404 || /not found|does not exist/i.test(errorMessage);
      if (isMissingUser) {
        console.info('[internal-forgot-password] recovery requested for unknown account');
        return send(res, 200, { message: genericMessage });
      }
      console.error('[internal-forgot-password] could not generate recovery link', {
        status: linkResponse.status,
        error: errorMessage || 'unknown error',
      });
      return send(res, 503, { message: 'ไม่สามารถสร้างลิงก์รีเซ็ตรหัสผ่านได้ กรุณาลองใหม่ภายหลัง' });
    }

    const actionLink = linkData?.action_link || linkData?.properties?.action_link;
    if (!actionLink) {
      console.error('[internal-forgot-password] Supabase response did not include action_link');
      return send(res, 503, { message: 'ไม่สามารถสร้างลิงก์รีเซ็ตรหัสผ่านได้ กรุณาลองใหม่ภายหลัง' });
    }

    const from = process.env.APPROVAL_EMAIL_FROM || 'Kumtsu Admin <account.it@kumtsu.com>';
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [normalized],
        subject: 'ตั้งรหัสผ่านใหม่สำหรับระบบภายใน Kumtsu',
        html: `
          <div style="background:#f3f5f3;padding:32px;font-family:Arial,'Noto Sans Thai',sans-serif;color:#172017">
            <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #dfe5df;border-radius:14px;overflow:hidden">
              <div style="background:#101410;padding:24px 28px;color:#fff">
                <div style="color:#39c66c;font-size:12px;font-weight:700;letter-spacing:2px">KUMTSU INTERNAL</div>
                <h1 style="margin:8px 0 0;font-size:24px">ตั้งรหัสผ่านใหม่</h1>
              </div>
              <div style="padding:28px">
                <p style="margin-top:0">เราได้รับคำขอให้ตั้งรหัสผ่านใหม่สำหรับ <strong>${escapeHtml(normalized)}</strong></p>
                <p>กดปุ่มด้านล่างเพื่อดำเนินการ ลิงก์นี้มีอายุจำกัดและใช้ได้เพียงครั้งเดียว</p>
                <p style="margin:26px 0"><a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#1ca650;color:#071109;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:700">ตั้งรหัสผ่านใหม่</a></p>
                <p style="font-size:13px;color:#687068">หากคุณไม่ได้ส่งคำขอนี้ สามารถละเว้นอีเมลฉบับนี้ได้โดยไม่ต้องดำเนินการใด ๆ</p>
              </div>
            </div>
          </div>`,
      }),
    });

    const emailResult = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok) {
      console.error('[internal-forgot-password] Resend error', {
        status: emailResponse.status,
        error: emailResult?.message || emailResult?.name || 'unknown error',
      });
      return send(res, 503, { message: 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่ภายหลัง' });
    }

    console.log('[internal-forgot-password] reset email sent', { emailId: emailResult.id });
    return send(res, 200, { message: genericMessage });
  } catch (error) {
    console.error('[internal-forgot-password] unexpected error', { error: String(error) });
    return send(res, 503, { message: 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่ภายหลัง' });
  }
};
