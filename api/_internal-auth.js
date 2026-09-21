const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not configured');
  return { url: url.replace(/\/$/, ''), key };
}

function serviceEnv() {
  const { url } = env();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  return { url, serviceKey };
}

function send(res, status, body) {
  res.statusCode = status;
  Object.entries(JSON_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 7_000_000) throw new Error('Payload too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function supabase(path, options = {}) {
  const { url, key } = env();
  const headers = { apikey: key, ...options.headers };
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  return { response, data };
}

async function currentUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const { response, data } = await supabase('/auth/v1/user', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.ok ? { token, user: data } : null;
}

async function serviceSupabase(path, options = {}) {
  const { url, serviceKey } = serviceEnv();
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...options.headers };
  const response = await fetch(`${url}${path}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  return { response, data };
}

async function adminUser(req) {
  const auth = await currentUser(req);
  if (!auth) return null;
  const { response, data } = await serviceSupabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=email,status`);
  const profile = response.ok ? data?.[0] : null;
  if (!profile || profile.status !== 'active' || String(profile.email || '').trim().toLowerCase() !== 'pachara.r@kumtsu.com') return null;
  return auth;
}

module.exports = { adminUser, bearer, currentUser, env, readJson, send, serviceEnv, serviceSupabase, supabase };
