const fallbackCatalog = require('../../menu-data.js');
const { callSupabase, currentAdmin, readJson, readMenuCatalog, send } = require('../_lib');

function clean(value, max = 500) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').slice(0, max);
}

function safeImage(value) {
  const image = clean(value, 1000);
  if (/^assets\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp|svg)$/i.test(image)) return image;
  if (/^https:\/\/[a-zA-Z0-9.-]+\/[^\s"'<>]+$/i.test(image)) return image;
  throw new Error('INVALID_ITEM');
}

function safeLink(value) {
  const link = clean(value, 1000);
  if (/^#[a-zA-Z0-9_-]+$/.test(link) || /^https:\/\/[a-zA-Z0-9.-]+\/[^\s"'<>]*$/i.test(link)) return link;
  throw new Error('INVALID_CATALOG');
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
    const deliveryApps = (Array.isArray(brand.deliveryApps) ? brand.deliveryApps : []).slice(0, 12).map((app, index) => ({
      id: clean(app.id, 80) || `delivery-${index + 1}`,
      name: clean(app.name, 100) || 'Delivery',
      url: safeLink(app.url),
      icon: safeImage(app.icon),
      enabled: app.enabled !== false,
    }));
    return {
      id,
      name: clean(brand.name, 160) || id,
      short: clean(brand.short, 100),
      monogram: clean(brand.monogram, 20),
      logo: safeImage(brand.logo),
      accent: clean(brand.accent, 30),
      categories,
      items,
      deliveryApps,
      sortOrder: Number.isInteger(brand.sortOrder) ? brand.sortOrder : brandIndex,
    };
  });
  const pageInput = input.page || {};
  const promotions = (Array.isArray(pageInput.promotions) ? pageInput.promotions : []).slice(0, 8).map((promotion, index) => ({
    id: clean(promotion.id, 80) || `promotion-${index + 1}`,
    enabled: promotion.enabled !== false,
    eyebrow: clean(promotion.eyebrow, 100),
    title: clean(promotion.title, 160),
    detail: clean(promotion.detail, 200),
    image: promotion.image ? safeImage(promotion.image) : '',
    url: safeLink(promotion.url || '#menu'),
  }));
  return {
    brands,
    page: {
      hero: { image: safeImage(pageInput.hero?.image || 'assets/kumtsu-cover.jpg'), position: ['left', 'center', 'right'].includes(pageInput.hero?.position) ? pageInput.hero.position : 'center' },
      promotionsTitle: clean(pageInput.promotionsTitle, 160) || 'เมนูเด็ดและสิทธิพิเศษ',
      promotions,
      deliveryTitle: clean(pageInput.deliveryTitle, 160) || 'สั่งผ่าน แอพ เดลิเวอรี่',
      deliverySubtitle: clean(pageInput.deliverySubtitle, 200) || 'กดแล้วไปยังหน้าร้านในแอปได้ทันที',
    },
  };
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
