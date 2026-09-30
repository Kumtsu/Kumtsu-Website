const fallbackCatalog = require('../menu-data.js');
const { readMenuCatalog, send } = require('./_lib');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { message: 'Method not allowed' });
  try {
    const result = await readMenuCatalog(fallbackCatalog);
    return send(res, 200, { catalog: result.catalog, updatedAt: result.updatedAt });
  } catch (_) {
    return send(res, 200, { catalog: fallbackCatalog, updatedAt: null });
  }
};
