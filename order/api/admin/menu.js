const fallbackCatalog = require('../../menu-data.js');
const { callSupabase, currentAdmin, readJson, readMenuCatalog, send } = require('../_lib');

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').slice(0, max);
}

function safeImage(value) {
  const image = clean(value, 1000);
  if (/^assets\/menu\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i.test(image)) return image;
  if (/^https:\/\/[a-zA-Z0-9.-]+\/[^\s"'<>]+$/i.test(image)) return image;
  throw new Error('INVALID_ITEM');
}

function normalizeCatalog(input) {
  if (!input || !Array.isArray(input.brands) || !input.brands.length || input.brands.length > 20) throw new Error('INVALID_CATALOG');
  const brands = input.brands.map((brand, brandIndex) => {
    const id = clean(brand.id, 80);
    if (!id || !Array.isArray(brand.items) || brand.items.length > 500 || !Array.isArray(brand.categories)) throw new Error('INVALID_CATALOG');
    const categories = brand.categories.map((category, categoryIndex) => ({
      id: clean(category.id, 100) || `${id}-category-${categoryIndex + 1}`,
      label: clean(category.label, 160) || 'ไม่ระบุหมวดหมู่',
    }));
    const categoryLabels = new Map(categories.map(category => [category.id, category.label]));
    const categoryIds = new Set(categories.map(category => category.id));
    const items = brand.items.map((item, itemIndex) => {
      const itemId = clean(item.id, 80);
      const price = Number(item.price);
      if (!itemId || !clean(item.name, 200) || !Number.isFinite(price) || price < 0 || price > 1_000_000) throw new Error('INVALID_ITEM');
      const category = clean(item.category, 100);
      if (!categoryIds.has(category)) throw new Error('INVALID_CATEGORY');
      const inferredBadge = /พ่นไฟ|หม่าล่า/.test(`${clean(item.name, 200)} ${categoryLabels.get(category) || ''}`);
      return {
        key: `${id}:${itemId}`,
        id: itemId,
        brand: id,
        category,
        name: clean(item.name, 200),
        en: clean(item.en, 240),
        price: Math.round(price * 100) / 100,
        image: safeImage(item.image),
        available: item.available !== false,
        badge: {
          enabled: item.badge ? item.badge.enabled === true : inferredBadge,
          text: clean(item.badge?.text, 80) || (inferredBadge ? 'พ่นไฟ' : ''),
        },
        sortOrder: Number.isInteger(item.sortOrder) ? item.sortOrder : itemIndex,
      };
    });
    return {
      id,
      name: clean(brand.name, 160) || id,
      short: clean(brand.short, 100),
      monogram: clean(brand.monogram, 20),
      logo: clean(brand.logo, 1000),
      accent: clean(brand.accent, 30),
      categories,
      items,
      sortOrder: Number.isInteger(brand.sortOrder) ? brand.sortOrder : brandIndex,
    };
  });
  return { brands };
}

module.exports = async function handler(req, res) {
  try {
    const admin = await currentAdmin(req);
    if (!admin) return send(res, 401, { message: 'กรุณาเข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาต' });

    if (req.method === 'GET') {
      const result = await readMenuCatalog(fallbackCatalog);
      return send(res, 200, { catalog: result.catalog, source: result.source, updatedAt: result.updatedAt });
    }

    if (req.method === 'PUT') {
      const body = await readJson(req);
      const catalog = normalizeCatalog(body.catalog);
      const saved = await callSupabase('/rest/v1/menu_catalog?on_conflict=id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ id: 'default', catalog, updated_by: admin.email }),
      }, true);
      if (!saved.response.ok) throw new Error('MENU_SAVE_FAILED');
      return send(res, 200, { catalog: saved.data[0].catalog, updatedAt: saved.data[0].updated_at });
    }

    return send(res, 405, { message: 'Method not allowed' });
  } catch (error) {
    if (['INVALID_CATALOG', 'INVALID_ITEM', 'INVALID_CATEGORY'].includes(error.message)) {
      return send(res, 400, { message: 'ข้อมูลเมนูไม่ถูกต้อง กรุณาตรวจชื่อ ราคา และหมวดหมู่' });
    }
    return send(res, 503, { message: 'ยังไม่สามารถบันทึกเมนูได้ กรุณาลองอีกครั้ง' });
  }
};
