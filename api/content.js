const { send, serviceSupabase } = require('./_internal-auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { message: 'Method not allowed' });
  const key = String(req.query?.key || 'home').trim().toLowerCase();
  if (!['home', 'news'].includes(key)) return send(res, 400, { message: 'Invalid content key' });
  try {
    const { response, data } = await serviceSupabase(`/rest/v1/site_content?content_key=eq.${encodeURIComponent(key)}&select=published_data,published_at`);
    if (!response.ok) return send(res, 503, { message: 'ไม่สามารถโหลดเนื้อหาได้' });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return send(res, 200, { content: data?.[0]?.published_data || null, publishedAt: data?.[0]?.published_at || null });
  } catch (error) {
    console.error('[content] load failed', error);
    return send(res, 503, { message: 'ไม่สามารถโหลดเนื้อหาได้' });
  }
};
