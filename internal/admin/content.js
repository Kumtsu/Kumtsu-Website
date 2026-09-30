import { api, clearSession, getSession, requireSession, showToast } from '../auth.js';

const designPreview = ['localhost','127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('design-preview') === '1';
if (!designPreview && !requireSession()) throw new Error('Authentication required');
if (!designPreview && String(getSession()?.user?.email || '').toLowerCase() !== 'pachara.r@kumtsu.com') {
  location.replace('../profile.html');
  throw new Error('Admin access required');
}

const editor = document.querySelector('#editor');
const title = document.querySelector('#pageTitle');
const updated = document.querySelector('#lastUpdated');
let page = 'home';
let data = {};

const defaults = {
  home: { heroSlides: [], about: { lead: '', paragraphs: [] }, stories: [], brands: [], franchise: { eyebrow: 'Business Opportunity', title: 'Franchise & Cloud Kitchen', image: '', imageAlt: '', heading: '', paragraphs: [], highlights: [] } },
  news: { items: [], relatedMode: 'latest', relatedIds: [] },
};

document.querySelector('#logoutButton').addEventListener('click', () => { clearSession(); location.replace('../login.html'); });
document.querySelectorAll('.cms-nav').forEach((button) => button.addEventListener('click', () => switchPage(button.dataset.page)));
document.querySelector('#saveButton').addEventListener('click', saveDraft);
document.querySelector('#publishButton').addEventListener('click', publish);
document.querySelector('#previewButton').addEventListener('click', preview);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const lines = (value) => String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);

function normalize(raw) {
  const base = clone(defaults[page]);
  return raw && typeof raw === 'object' ? Object.assign(base, raw) : base;
}

async function switchPage(next) {
  page = next;
  document.querySelectorAll('.cms-nav').forEach((button) => button.classList.toggle('is-active', button.dataset.page === page));
  title.textContent = page === 'home' ? 'จัดการหน้า Home' : 'จัดการข่าวสาร & กิจกรรม';
  await load();
}

async function load() {
  editor.innerHTML = '<div class="empty">กำลังโหลดข้อมูล…</div>';
  if (designPreview) {
    data = page === 'home' ? await bootstrapHome() : clone(defaults.news);
    updated.textContent = 'โหมดตัวอย่าง — ยังไม่เชื่อมต่อข้อมูลจริง';
    render();
    return;
  }
  const { response, data: result } = await api(`/api/admin/content?key=${page}`);
  if (!response.ok) throw new Error(result.message || 'โหลดข้อมูลไม่สำเร็จ');
  data = normalize(result.content?.draft_data);
  if (page === 'home' && !Object.keys(result.content?.draft_data || {}).length) data = await bootstrapHome();
  const stamp = result.content?.updated_at;
  updated.textContent = stamp ? `แก้ไขล่าสุด ${new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'short' }).format(new Date(stamp))}` : 'ยังไม่มีการแก้ไข';
  render();
}

async function bootstrapHome() {
  try {
    const response = await fetch('/index.html');
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const current = clone(defaults.home);
    current.heroSlides = [...doc.querySelectorAll('.hero-slide img')].map((img) => ({ image:img.src, alt:img.alt }));
    current.about = { lead:doc.querySelector('#about .lead')?.textContent.trim() || '', paragraphs:[...doc.querySelectorAll('#about .about-detail p')].map((node) => node.textContent.trim()) };
    current.stories = [...doc.querySelectorAll('#vision .story-layout')].map((layout) => ({
      eyebrow:layout.querySelector('.eyebrow')?.textContent.trim() || '', title:layout.querySelector('h2')?.textContent.trim() || '',
      paragraphs:[...layout.querySelectorAll('.story-copy p')].map((node) => node.textContent.trim()), image:layout.querySelector('img')?.src || '', imageAlt:layout.querySelector('img')?.alt || '',
      imageSide:layout.firstElementChild?.tagName === 'FIGURE' ? 'left' : 'right', imageFit:layout.querySelector('.story-image--contain') ? 'contain' : 'cover',
    }));
    current.brands = [...doc.querySelectorAll('#brands .brand-card img')].map((img) => ({ name:img.alt.replace(/^โลโก้/, '').trim(), logo:img.src, alt:img.alt }));
    const franchise = doc.querySelector('#franchise');
    current.franchise = { eyebrow:franchise?.querySelector('.franchise-head .eyebrow')?.textContent.trim() || '', title:franchise?.querySelector('.franchise-head h2')?.textContent.trim() || '', image:franchise?.querySelector('.franchise-image img')?.src || '', imageAlt:franchise?.querySelector('.franchise-image img')?.alt || '', heading:franchise?.querySelector('.franchise-copy h3')?.textContent.trim() || '', paragraphs:[...franchise.querySelectorAll('.franchise-copy p')].map((node) => node.textContent.trim()), highlights:[...franchise.querySelectorAll('.franchise-list li')].map((node) => node.textContent.trim()) };
    return current;
  } catch (_) { return clone(defaults.home); }
}

function section(name, label, addLabel, body) {
  return `<section class="editor-section" data-section="${name}"><div class="section-heading"><h2>${label}</h2>${addLabel ? `<button class="add-button" type="button" data-add="${name}">+ ${addLabel}</button>` : ''}</div>${body}</section>`;
}
function toolbar(label, sectionName, index) {
  return `<div class="item-toolbar"><strong>${label}</strong><div class="item-buttons"><button type="button" data-move="up" data-section="${sectionName}" data-index="${index}" aria-label="เลื่อนขึ้น">↑</button><button type="button" data-move="down" data-section="${sectionName}" data-index="${index}" aria-label="เลื่อนลง">↓</button><button class="remove" type="button" data-remove="${sectionName}" data-index="${index}">ลบ</button></div></div>`;
}
function imageField(value, path, alt = '') {
  return `<div class="image-field" data-image-path="${path}"><img src="${escapeHtml(value || '/internal/profile-placeholder.svg')}" alt="${escapeHtml(alt)}"><div><label class="upload-button">เลือกรูป<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload="${path}"></label><input class="image-url" type="url" value="${escapeHtml(value)}" data-bind="${path}" placeholder="หรือวาง URL รูปภาพ"><small>JPG, PNG, WEBP หรือ GIF ไม่เกิน 10 MB</small></div></div>`;
}
function empty(text) { return `<div class="empty">${text}</div>`; }

function renderHome() {
  const slides = data.heroSlides.map((item, index) => `<div class="editor-item">${toolbar(`ภาพสไลด์ ${index + 1}`, 'heroSlides', index)}${imageField(item.image, `heroSlides.${index}.image`, item.alt)}<label class="field full"><span>คำอธิบายรูป</span><input data-bind="heroSlides.${index}.alt" value="${escapeHtml(item.alt)}"></label></div>`).join('');
  const stories = data.stories.map((item, index) => `<div class="editor-item">${toolbar(`บล็อกเรื่องราว ${index + 1}`, 'stories', index)}<div class="field-grid"><label class="field"><span>หัวข้อภาษาอังกฤษ</span><input data-bind="stories.${index}.eyebrow" value="${escapeHtml(item.eyebrow)}"></label><label class="field"><span>หัวข้อหลัก</span><input data-bind="stories.${index}.title" value="${escapeHtml(item.title)}"></label><label class="field full"><span>เนื้อหา (ขึ้นบรรทัดใหม่เพื่อสร้างย่อหน้า)</span><textarea data-bind-lines="stories.${index}.paragraphs">${escapeHtml((item.paragraphs || []).join('\n\n'))}</textarea></label><label class="field"><span>ตำแหน่งรูป</span><select data-bind="stories.${index}.imageSide"><option value="right" ${item.imageSide !== 'left' ? 'selected' : ''}>ด้านขวา</option><option value="left" ${item.imageSide === 'left' ? 'selected' : ''}>ด้านซ้าย</option></select></label><label class="field"><span>การแสดงรูป</span><select data-bind="stories.${index}.imageFit"><option value="cover" ${item.imageFit !== 'contain' ? 'selected' : ''}>เต็มกรอบ</option><option value="contain" ${item.imageFit === 'contain' ? 'selected' : ''}>เห็นรูปเต็ม</option></select></label><div class="field full">${imageField(item.image, `stories.${index}.image`, item.imageAlt)}</div><label class="field full"><span>คำอธิบายรูป</span><input data-bind="stories.${index}.imageAlt" value="${escapeHtml(item.imageAlt)}"></label></div></div>`).join('');
  const brands = data.brands.map((item, index) => `<div class="editor-item">${toolbar(`แบรนด์ ${index + 1}`, 'brands', index)}<div class="field-grid"><label class="field"><span>ชื่อแบรนด์</span><input data-bind="brands.${index}.name" value="${escapeHtml(item.name)}"></label><label class="field"><span>คำอธิบายโลโก้</span><input data-bind="brands.${index}.alt" value="${escapeHtml(item.alt)}"></label><div class="field full">${imageField(item.logo, `brands.${index}.logo`, item.alt)}</div></div></div>`).join('');
  editor.innerHTML = [
    section('heroSlides', 'รูปสไลด์ด้านบน', 'เพิ่มรูปสไลด์', `<div class="item-list">${slides || empty('ยังไม่มีรูปสไลด์')}</div>`),
    section('about', 'About Kumtsu', '', `<div class="field-grid"><label class="field full"><span>ข้อความเกริ่นนำ</span><textarea data-bind="about.lead">${escapeHtml(data.about.lead)}</textarea></label><label class="field full"><span>รายละเอียด (ขึ้นบรรทัดใหม่เพื่อสร้างย่อหน้า)</span><textarea data-bind-lines="about.paragraphs">${escapeHtml((data.about.paragraphs || []).join('\n\n'))}</textarea></label></div>`),
    section('stories', 'Our Story', 'เพิ่มบล็อกเรื่องราว', `<div class="item-list">${stories || empty('ยังไม่มีบล็อกเรื่องราว')}</div>`),
    section('brands', 'แบรนด์ในเครือ', 'เพิ่มแบรนด์', `<div class="item-list">${brands || empty('ยังไม่มีแบรนด์')}</div>`),
    section('franchise', 'Franchise & Cloud Kitchen', '', `<div class="field-grid"><label class="field"><span>หัวข้อภาษาอังกฤษ</span><input data-bind="franchise.eyebrow" value="${escapeHtml(data.franchise.eyebrow)}"></label><label class="field"><span>หัวข้อส่วน</span><input data-bind="franchise.title" value="${escapeHtml(data.franchise.title)}"></label><label class="field full"><span>หัวข้อเนื้อหา</span><input data-bind="franchise.heading" value="${escapeHtml(data.franchise.heading)}"></label><label class="field full"><span>เนื้อหา (ขึ้นบรรทัดใหม่เพื่อสร้างย่อหน้า)</span><textarea data-bind-lines="franchise.paragraphs">${escapeHtml((data.franchise.paragraphs || []).join('\n\n'))}</textarea></label><label class="field full"><span>จุดเด่น (หนึ่งรายการต่อบรรทัด)</span><textarea data-bind-lines="franchise.highlights">${escapeHtml((data.franchise.highlights || []).join('\n'))}</textarea></label><div class="field full">${imageField(data.franchise.image, 'franchise.image', data.franchise.imageAlt)}</div><label class="field full"><span>คำอธิบายรูป</span><input data-bind="franchise.imageAlt" value="${escapeHtml(data.franchise.imageAlt)}"></label></div>`),
  ].join('');
}

function renderNews() {
  const items = data.items.map((item, index) => {
    if (!Array.isArray(item.blocks)) item.blocks = (item.body || []).map((text) => ({ type:'text', text }));
    const blocks = item.blocks.map((block, blockIndex) => `<div class="content-block">${toolbar(`${block.type === 'image' ? 'รูปภาพ' : 'ข้อความ'} ${blockIndex + 1}`, `items.${index}.blocks`, blockIndex)}${block.type === 'image' ? `<div class="field-grid"><div class="field full">${imageField(block.image, `items.${index}.blocks.${blockIndex}.image`, block.alt)}</div><label class="field"><span>คำอธิบายรูป</span><input data-bind="items.${index}.blocks.${blockIndex}.alt" value="${escapeHtml(block.alt)}"></label><label class="field"><span>ตำแหน่งรูป</span><select data-bind="items.${index}.blocks.${blockIndex}.layout"><option value="full" ${block.layout === 'full' ? 'selected' : ''}>เต็มความกว้าง</option><option value="left" ${block.layout === 'left' ? 'selected' : ''}>ชิดซ้าย</option><option value="right" ${block.layout === 'right' ? 'selected' : ''}>ชิดขวา</option></select></label></div>` : `<label class="field full"><span>เนื้อหา</span><textarea data-bind="items.${index}.blocks.${blockIndex}.text">${escapeHtml(block.text)}</textarea></label>`}</div>`).join('');
    return `<div class="editor-item">${toolbar(`ข่าว ${index + 1}`, 'items', index)}<div class="field-grid"><label class="field"><span>หัวข้อข่าว</span><input data-bind="items.${index}.title" value="${escapeHtml(item.title)}"></label><label class="field"><span>หมวดหมู่</span><input data-bind="items.${index}.category" value="${escapeHtml(item.category)}"></label><label class="field"><span>วันที่</span><input type="date" data-bind="items.${index}.date" value="${escapeHtml(item.date)}"></label><label class="field"><span>สถานะ</span><select data-bind="items.${index}.status"><option value="draft" ${item.status !== 'published' ? 'selected' : ''}>ฉบับร่าง</option><option value="published" ${item.status === 'published' ? 'selected' : ''}>เผยแพร่</option></select></label><label class="field full"><span>ข้อความย่อ</span><textarea data-bind="items.${index}.excerpt">${escapeHtml(item.excerpt)}</textarea></label><div class="field full">${imageField(item.cover, `items.${index}.cover`, item.title)}</div></div><div class="block-heading"><strong>เนื้อหาข่าว</strong><div><button type="button" class="add-button" data-add-block="text" data-item="${index}">+ ข้อความ</button><button type="button" class="add-button" data-add-block="image" data-item="${index}">+ รูปภาพ</button></div></div><div class="block-list">${blocks || empty('เพิ่มข้อความหรือรูปภาพได้ตามต้องการ')}</div></div>`;
  }).join('');
  editor.innerHTML = [section('items', 'รายการข่าวสาร & กิจกรรม', 'เพิ่มข่าว', `<div class="item-list">${items || empty('ยังไม่มีข่าว')}</div>`), section('related', 'ข่าวสารอื่น ๆ', '', `<div class="field-grid"><label class="field"><span>วิธีเลือกข่าวแนะนำ</span><select data-bind="relatedMode"><option value="latest" ${data.relatedMode !== 'manual' ? 'selected' : ''}>ข่าวล่าสุดอัตโนมัติ</option><option value="manual" ${data.relatedMode === 'manual' ? 'selected' : ''}>เลือกเอง</option></select></label><label class="field"><span>รหัสข่าวที่เลือก (คั่นด้วยเครื่องหมายจุลภาค)</span><input data-bind-csv="relatedIds" value="${escapeHtml((data.relatedIds || []).join(', '))}"></label></div>`)].join('');
}

function render() { page === 'home' ? renderHome() : renderNews(); }

function pathParts(path) { return path.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part); }
function setPath(path, value) { const parts = pathParts(path); let target = data; parts.slice(0,-1).forEach((part) => { target = target[part]; }); target[parts.at(-1)] = value; }
function syncInputs() {
  editor.querySelectorAll('[data-bind]').forEach((input) => setPath(input.dataset.bind, input.value));
  editor.querySelectorAll('[data-bind-lines]').forEach((input) => setPath(input.dataset.bindLines, lines(input.value)));
  editor.querySelectorAll('[data-bind-csv]').forEach((input) => setPath(input.dataset.bindCsv, input.value.split(',').map((item) => item.trim()).filter(Boolean)));
}

editor.addEventListener('input', (event) => { const input = event.target; if (input.dataset.bind) setPath(input.dataset.bind, input.value); if (input.dataset.bindLines) setPath(input.dataset.bindLines, lines(input.value)); if (input.dataset.bindCsv) setPath(input.dataset.bindCsv, input.value.split(',').map((item) => item.trim()).filter(Boolean)); if (input.classList.contains('image-url')) input.closest('.image-field').querySelector('img').src = input.value || '/internal/profile-placeholder.svg'; });
editor.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-upload]'); if (!input?.files?.[0]) return;
  const file = input.files[0];
  if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) return toast('รูปต้องเป็น JPG, PNG, WEBP หรือ GIF และไม่เกิน 10 MB', true);
  input.disabled = true;
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const { response, data: result } = await api('/api/admin/content-upload', { method:'POST', body:JSON.stringify({ dataUrl, folder:page }) });
    if (!response.ok) throw new Error(result.message || 'อัปโหลดรูปไม่สำเร็จ');
    setPath(input.dataset.upload, result.url); render(); toast('อัปโหลดรูปแล้ว');
  } catch (error) { toast(error.message, true); } finally { input.disabled = false; }
});
editor.addEventListener('click', (event) => {
  const add = event.target.closest('[data-add]'); if (add) { syncInputs(); const key = add.dataset.add; const fresh = { heroSlides:{ image:'',alt:'' }, stories:{ eyebrow:'Our Story',title:'',paragraphs:[],image:'',imageAlt:'',imageSide:'right',imageFit:'cover' }, brands:{ name:'',logo:'',alt:'' }, items:{ id:`news-${Date.now()}`,title:'',category:'ข่าวสาร',date:new Date().toISOString().slice(0,10),status:'draft',excerpt:'',cover:'',body:[] } }[key]; data[key].push(fresh); return render(); }
  const remove = event.target.closest('[data-remove]'); if (remove) { syncInputs(); getPath(remove.dataset.remove).splice(Number(remove.dataset.index),1); return render(); }
  const block = event.target.closest('[data-add-block]'); if (block) { syncInputs(); const list = data.items[Number(block.dataset.item)].blocks ||= []; list.push(block.dataset.addBlock === 'image' ? { type:'image',image:'',alt:'',layout:'full' } : { type:'text',text:'' }); return render(); }
  const move = event.target.closest('[data-move]'); if (move) { syncInputs(); const list = getPath(move.dataset.section); const from = Number(move.dataset.index); const to = move.dataset.move === 'up' ? from - 1 : from + 1; if (to >= 0 && to < list.length) [list[from],list[to]] = [list[to],list[from]]; return render(); }
});

function getPath(path) { return pathParts(path).reduce((target, part) => target[part], data); }
async function persistDraft() { const { response, data: result } = await api(`/api/admin/content?key=${page}`, { method:'PUT', body:JSON.stringify({ data }) }); if (!response.ok) throw new Error(result.message || 'บันทึกไม่สำเร็จ'); updated.textContent = 'บันทึกร่างเมื่อสักครู่'; }
async function saveDraft() { syncInputs(); if (designPreview) return toast('โหมดตัวอย่างยังไม่บันทึกข้อมูลจริง'); await busy(async () => { await persistDraft(); toast('บันทึกร่างแล้ว'); }); }
async function publish() { syncInputs(); if (designPreview) return toast('โหมดตัวอย่างยังไม่เผยแพร่ขึ้นเว็บจริง'); await busy(async () => { await persistDraft(); const { response, data: result } = await api(`/api/admin/content?key=${page}`, { method:'POST' }); if (!response.ok) throw new Error(result.message || 'เผยแพร่ไม่สำเร็จ'); toast('เผยแพร่เนื้อหาเรียบร้อยแล้ว'); }); }
function preview() { syncInputs(); sessionStorage.setItem(`kumtsu-cms-preview-${page}`, JSON.stringify(data)); window.open(page === 'home' ? '/?cms-preview=home' : '/news.html?cms-preview=news', '_blank', 'noopener'); }
async function busy(task) { const buttons = [...document.querySelectorAll('.cms-actions button')]; buttons.forEach((button) => button.disabled = true); try { await task(); } catch (error) { toast(error.message, true); } finally { buttons.forEach((button) => button.disabled = false); } }
function toast(message, error = false) { showToast(message, error ? 'error' : undefined); }

load().catch((error) => { editor.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; toast(error.message, true); });
