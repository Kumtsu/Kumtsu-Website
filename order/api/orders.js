const catalog = require('../menu-data.js');
const { callSupabase, readJson, send } = require('./_lib');

function clean(value, max = 500) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

function orderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `KM${date}${random}`;
}

async function notifyLine(order) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_TARGET_ID;
  if (!token || !to) return { status: 'not_configured', error: '' };
  const itemText = order.items.map(item => `• ${item.name} ×${item.quantity} — ฿${item.line_total}`).join('\n');
  const receive = order.fulfilment_method === 'delivery' ? `จัดส่ง: ${order.customer_address}` : 'รับอาหารที่ร้าน';
  const text = [
    `🔔 ออเดอร์ใหม่ ${order.order_number}`,
    `แบรนด์: ${order.brand_name}`,
    `ลูกค้า: ${order.customer_name}`,
    `โทร: ${order.customer_phone}`,
    receive,
    '', itemText,
    '', `รวม ฿${order.subtotal}`,
    order.customer_note ? `หมายเหตุ: ${order.customer_note}` : '',
    '', `เปิดหลังบ้าน: https://order.kumtsu.com/admin/?order=${encodeURIComponent(order.order_number)}`,
  ].filter(Boolean).join('\n').slice(0, 4900);
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
    if (!response.ok) return { status: 'failed', error: `LINE API ${response.status}` };
    return { status: 'sent', error: '' };
  } catch (error) {
    return { status: 'failed', error: clean(error.message, 300) };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const brand = catalog.brands.find(entry => entry.id === clean(body.brandId, 80));
    if (!brand) return send(res, 400, { message: 'ไม่พบแบรนด์ที่เลือก' });
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return send(res, 400, { message: 'รายการอาหารไม่ถูกต้อง' });

    let totalQuantity = 0;
    const items = body.items.map(entry => {
      const menu = brand.items.find(item => item.id === clean(entry.id, 80));
      const quantity = Number(entry.quantity);
      if (!menu || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || !Number.isFinite(menu.price)) throw new Error('INVALID_ITEM');
      totalQuantity += quantity;
      return { id: menu.id, name: menu.name, quantity, unit_price: menu.price, line_total: menu.price * quantity };
    });
    if (totalQuantity > 100) return send(res, 400, { message: 'จำนวนรายการมากเกินไป' });

    const customerName = clean(body.customerName, 120);
    const customerPhone = clean(body.customerPhone, 30);
    const method = body.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery';
    const address = clean(body.customerAddress, 600);
    const note = clean(body.customerNote, 600);
    if (!customerName || customerPhone.length < 8 || (method === 'delivery' && !address)) return send(res, 400, { message: 'กรุณากรอกข้อมูลผู้สั่งและที่อยู่ให้ครบถ้วน' });

    const order = {
      order_number: orderNumber(),
      status: 'new',
      brand_id: brand.id,
      brand_name: brand.name,
      fulfilment_method: method,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: method === 'delivery' ? address : null,
      customer_note: note || null,
      items,
      subtotal: items.reduce((sum, item) => sum + item.line_total, 0),
      notification_status: 'pending',
    };

    const inserted = await callSupabase('/rest/v1/web_orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(order),
    }, true);
    if (!inserted.response.ok) throw new Error('ORDER_SAVE_FAILED');
    const saved = inserted.data[0];
    const notification = await notifyLine(saved);
    await callSupabase(`/rest/v1/web_orders?id=eq.${encodeURIComponent(saved.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_status: notification.status, notification_error: notification.error || null }),
    }, true);
    return send(res, 201, { orderNumber: saved.order_number, status: saved.status, notification: notification.status });
  } catch (error) {
    if (error.message === 'INVALID_ITEM') return send(res, 400, { message: 'พบรายการหรือราคาที่ไม่ถูกต้อง กรุณาโหลดหน้าเว็บใหม่' });
    return send(res, 503, { message: 'ยังไม่สามารถส่งออเดอร์ได้ กรุณาลองอีกครั้ง' });
  }
};
