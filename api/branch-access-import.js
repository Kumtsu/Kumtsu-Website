const crypto = require('node:crypto');
const { readJson, send, serviceSupabase } = require('./_internal-auth');
const { encryptSecret } = require('./_branch-access');

function validToken(req) {
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = String(process.env.BRANCH_ACCESS_IMPORT_TOKEN || '');
  if (!supplied || !expected || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function writeRows(table, rows) {
  for (let index = 0; index < rows.length; index += 100) {
    const result = await serviceSupabase(`/rest/v1/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(index, index + 100)),
    });
    if (!result.response.ok) throw new Error(result.data?.message || `Import failed for ${table}`);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  if (!validToken(req)) return send(res, 403, { message: 'Import token is invalid' });
  try {
    const body = await readJson(req);
    const branches = Array.isArray(body.branches) ? body.branches : [];
    const brands = Array.isArray(body.brands) ? body.brands : [];
    const channels = Array.isArray(body.channels) ? body.channels : [];
    if (!branches.length || !brands.length || !channels.length) return send(res, 400, { message: 'Import payload is incomplete' });

    for (const table of ['branch_access_channels', 'branch_access_brands', 'branch_access_branches']) {
      const removed = await serviceSupabase(`/rest/v1/${table}?id=gte.0`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      if (!removed.response.ok) throw new Error(removed.data?.message || `Could not clear ${table}`);
    }

    await writeRows('branch_access_branches', branches.map((row) => ({
      id: row.id, code: row.code, name: row.name, address: row.address, phone: row.phone, coordinates: row.coordinates,
    })));
    await writeRows('branch_access_brands', brands.map((row) => ({
      id: row.id, branch_id: row.branchId, name: row.name, code: row.code,
      login_identifier: row.loginIdentifier, password_encrypted: encryptSecret(row.password),
    })));
    await writeRows('branch_access_channels', channels.map((row) => ({
      id: row.id, brand_id: row.brandId, name: row.name,
      login_identifier: row.loginIdentifier, password_encrypted: encryptSecret(row.password),
    })));
    return send(res, 200, { imported: { branches: branches.length, brands: brands.length, channels: channels.length } });
  } catch (error) {
    console.error('[branch-access-import]', error);
    return send(res, 500, { message: error.message || 'Import failed' });
  }
};
