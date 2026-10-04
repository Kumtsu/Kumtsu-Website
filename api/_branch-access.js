const crypto = require('node:crypto');
const { currentUser, send, serviceSupabase, supabase } = require('./_internal-auth');

const ADMIN_EMAIL = 'pachara.r@kumtsu.com';
const TABLES = {
  branch: {
    table: 'branch_access_branches',
    fields: ['code', 'name', 'address', 'phone', 'coordinates'],
  },
  brand: {
    table: 'branch_access_brands',
    fields: ['name', 'code', 'login_identifier'],
  },
  channel: {
    table: 'branch_access_channels',
    fields: ['name', 'login_identifier'],
  },
};

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function encryptionKey() {
  const value = String(process.env.BRANCH_ACCESS_ENCRYPTION_KEY || '').trim();
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('BRANCH_ACCESS_ENCRYPTION_KEY must be a 32-byte base64 value');
  return key;
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptSecret(value) {
  const [version, ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted credential');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

async function requireActiveUser(req, res) {
  const auth = await currentUser(req);
  if (!auth) {
    send(res, 401, { message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
    return null;
  }
  const query = `/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}&select=employee_id,first_name,last_name,email,status`;
  const result = await supabase(query, { headers: { Authorization: `Bearer ${auth.token}`, Accept: 'application/json' } });
  const profile = result.response.ok ? result.data?.[0] : null;
  if (!profile || profile.status !== 'active') {
    send(res, 403, { message: 'บัญชีนี้ยังไม่ได้รับอนุมัติให้ใช้งาน' });
    return null;
  }
  return { auth, profile, canEdit: normalizedEmail(auth.user.email || profile.email) === ADMIN_EMAIL };
}

async function readTable(path) {
  const result = await serviceSupabase(path, { headers: { Accept: 'application/json' } });
  if (!result.response.ok) throw new Error(result.data?.message || 'Database request failed');
  return Array.isArray(result.data) ? result.data : [];
}

async function loadSnapshot() {
  const [branches, brands, channels] = await Promise.all([
    readTable('/rest/v1/branch_access_branches?select=id,code,name,address,phone,coordinates&order=id.asc'),
    readTable('/rest/v1/branch_access_brands?select=id,branch_id,name,code,login_identifier,password_encrypted&order=id.asc'),
    readTable('/rest/v1/branch_access_channels?select=id,brand_id,name,login_identifier,password_encrypted&order=id.asc'),
  ]);
  return {
    branches,
    brands: brands.map(({ password_encrypted, ...row }) => ({ ...row, has_password: Boolean(password_encrypted) })),
    channels: channels.map(({ password_encrypted, ...row }) => ({ ...row, has_password: Boolean(password_encrypted) })),
  };
}

function cleanChanges(entity, input) {
  const config = TABLES[entity];
  if (!config) return null;
  const output = {};
  for (const field of config.fields) {
    if (Object.prototype.hasOwnProperty.call(input || {}, field)) output[field] = String(input[field] || '').trim().slice(0, 500);
  }
  if ((entity === 'brand' || entity === 'channel') && Object.prototype.hasOwnProperty.call(input || {}, 'password')) {
    const password = String(input.password || '');
    if (password) output.password_encrypted = encryptSecret(password);
  }
  output.updated_at = new Date().toISOString();
  return output;
}

module.exports = {
  ADMIN_EMAIL,
  TABLES,
  cleanChanges,
  decryptSecret,
  encryptSecret,
  loadSnapshot,
  normalizedEmail,
  requireActiveUser,
};
