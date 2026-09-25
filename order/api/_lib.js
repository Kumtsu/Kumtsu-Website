const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const ADMIN_EMAILS = new Set(['pachara.r@kumtsu.com', 'sudarat@kumtsu.com']);

function env() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !serviceKey) throw new Error('Supabase environment variables are not configured');
  return { url: url.replace(/\/$/, ''), publishableKey, serviceKey };
}

function send(res, status, body) {
  res.statusCode = status;
  Object.entries(JSON_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Payload too large');
  }
  return raw ? JSON.parse(raw) : {};
}

async function callSupabase(path, options = {}, useServiceRole = false) {
  const { url, publishableKey, serviceKey } = env();
  const key = useServiceRole ? serviceKey : publishableKey;
  const serviceAuthorization = useServiceRole && !serviceKey.startsWith('sb_secret_') ? { Authorization: `Bearer ${serviceKey}` } : {};
  const headers = { apikey: key, ...serviceAuthorization, ...options.headers };
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  return { response, data };
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function currentAdmin(req) {
  const token = bearer(req);
  if (!token) return null;
  const userResult = await callSupabase('/auth/v1/user', { headers: { Authorization: `Bearer ${token}` } });
  if (!userResult.response.ok) return null;
  const email = String(userResult.data.email || '').trim().toLowerCase();
  if (!ADMIN_EMAILS.has(email)) return null;
  const profileResult = await callSupabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(userResult.data.id)}&select=status`, {}, true);
  if (!profileResult.response.ok || profileResult.data?.[0]?.status !== 'active') return null;
  return { token, user: userResult.data, email };
}

module.exports = { ADMIN_EMAILS, callSupabase, currentAdmin, env, readJson, send };
