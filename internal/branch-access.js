import { api, requireSession, showToast } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');

const state = { data: null, selectedBranchId: null, editTarget: null, revealed: new Map() };
const $ = (selector) => document.querySelector(selector);
const { BRAND_OPTIONS, CHANNEL_OPTIONS, brandCode, isFoodstory } = window.BranchAccessCatalog;
const BRAND_LOGOS = [
  [/^คุ้มสึ$|kumtsu/i, './branch-access-assets/brands/kumtsu.png'],
  [/ไก่ทอดแอนโทนี่|แอนโทนี่|anthony/i, './branch-access-assets/brands/anthony.jpg'],
  [/หมีปุ้ง/i, './branch-access-assets/brands/meepung.jpg'],
  [/โซ้ย|zoy/i, './branch-access-assets/brands/zoy.jpg'],
  [/ข่า.*ตะไคร้.*ใบมะกรูด/i, './branch-access-assets/brands/kha-takrai.jpg'],
  [/นัว.*นัว/i, './branch-access-assets/brands/nua-nua.png'],
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function logoFor(name) {
  return BRAND_LOGOS.find(([pattern]) => pattern.test(name))?.[1] || './profile-placeholder.svg';
}

function mapUrl(value) {
  const text = String(value || '').trim();
  if (/^https?:\/\//i.test(text)) return text;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

function renderBranches() {
  const query = $('#branchSearch').value.trim().toLocaleLowerCase('th');
  const rows = state.data.branches.filter((branch) => `${branch.code} ${branch.name}`.toLocaleLowerCase('th').includes(query));
  $('#branchList').innerHTML = rows.map((branch) => `<button class="branch-item${branch.id === state.selectedBranchId ? ' active' : ''}" data-branch-id="${branch.id}" type="button"><span class="branch-number">${escapeHtml(branch.code)}</span><strong>${escapeHtml(branch.name)}</strong></button>`).join('');
}

function credentialRow(kind, row, label) {
  const key = `${kind}:${row.id}`;
  const password = state.revealed.get(key);
  return `<div class="credential-row"><div class="credential-copy"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(row.login_identifier)}">${escapeHtml(row.login_identifier || '—')}</strong><span>รหัสผ่าน: ${password ? escapeHtml(password) : '••••••••'}</span></div><div class="row-actions"><button class="mini-button" data-reveal-kind="${kind}" data-reveal-id="${row.id}" type="button">${password ? 'ซ่อน' : 'ดูรหัส'}</button><button class="mini-button admin-only" data-edit-kind="${kind}" data-edit-id="${row.id}" type="button"${state.data.access.canEdit ? '' : ' hidden'}>แก้ไข</button></div></div>`;
}

function channelRow(channel) {
  const key = `channel:${channel.id}`;
  const password = state.revealed.get(key);
  return `<div class="channel-row"><div><h5>${escapeHtml(channel.name)}</h5><p>${escapeHtml(channel.login_identifier || '—')}</p>${password ? `<p>รหัสผ่าน: <strong>${escapeHtml(password)}</strong></p>` : ''}</div><div class="row-actions"><button class="mini-button" data-reveal-kind="channel" data-reveal-id="${channel.id}" type="button">${password ? 'ซ่อน' : 'ดูรหัส'}</button><button class="mini-button admin-only" data-edit-kind="channel" data-edit-id="${channel.id}" type="button"${state.data.access.canEdit ? '' : ' hidden'}>แก้ไข</button></div></div>`;
}

function foodstoryPinRow(kind, account) {
  const key = `${kind}:${account.id}:wongnai_pos_pin`;
  const revealed = state.revealed.get(key);
  const value = revealed || (account.has_wongnai_pos_pin ? '••••' : 'ยังไม่ได้ระบุ');
  return `<div class="credential-row foodstory-pin-row"><div class="credential-copy"><span>รหัส 4 ตัว Wongnai pos</span><strong>${escapeHtml(value)}</strong></div>${account.has_wongnai_pos_pin ? `<div class="row-actions"><button class="mini-button" data-reveal-kind="${kind}" data-reveal-id="${account.id}" data-reveal-field="wongnai_pos_pin" type="button">${revealed ? 'ซ่อนรหัส 4 ตัว' : 'ดูรหัส 4 ตัว'}</button></div>` : ''}</div>`;
}

function availableChannels(brandId) {
  return CHANNEL_OPTIONS.filter((name) => !isFoodstory(name) && !state.data.channels.some((channel) =>
    channel.brand_id === brandId && channel.name.toLowerCase() === name.toLowerCase()));
}

function renderSelectedBranch() {
  const branch = state.data.branches.find((row) => row.id === state.selectedBranchId);
  if (!branch) return;
  const brands = state.data.brands.filter((row) => row.branch_id === branch.id);
  const channels = state.data.channels.filter((row) => brands.some((brand) => brand.id === row.brand_id));
  const foodstoryAccount = state.data.foodstory?.find((row) => row.branch_id === branch.id);
  const legacyFoodstory = channels.find((channel) => isFoodstory(channel.name));
  const deliveryChannelCount = channels.filter((channel) => !/food\s*story/i.test(channel.name)).length;
  $('#branchCode').textContent = `BRANCH ${branch.code}`;
  $('#branchName').textContent = branch.name;
  $('#branchAddress').textContent = branch.address || 'ยังไม่มีข้อมูลที่อยู่';
  $('#branchPhone').href = branch.phone ? `tel:${branch.phone}` : '#';
  $('#branchPhone strong').textContent = branch.phone || '—';
  $('#branchMap').href = mapUrl(branch.coordinates);
  $('#accountSummary').textContent = `${brands.length} แบรนด์ · ${deliveryChannelCount} ช่องทางเดลิเวอรี`;
  const brandCards = brands.map((brand) => {
    const brandChannels = state.data.channels.filter((row) => row.brand_id === brand.id);
    const deliveryChannels = brandChannels.filter((channel) => !/food\s*story/i.test(channel.name));
    const deliverySection = deliveryChannels.length
      ? `<div class="channel-list"><p class="subsection-label">DELIVERY CHANNELS</p>${deliveryChannels.map(channelRow).join('')}</div>`
      : '';
    const emptyState = deliveryChannels.length ? '' : '<div class="channel-list"><p class="muted">ไม่มีช่องทางเดลิเวอรี</p></div>';
    const addChannel = state.data.access.canEdit ? `<button class="mini-button channel-add" data-add-channel-brand-id="${brand.id}" type="button"${availableChannels(brand.id).length ? '' : ' disabled'}>+ เพิ่มช่องทางขาย</button>` : '';
    return `<article class="brand-card"><div class="brand-head"><div class="brand-identity"><img class="brand-logo" src="${logoFor(brand.name)}" alt=""><div><h4>${escapeHtml(brand.name)}</h4><span class="brand-code">${escapeHtml(brand.code)}</span></div></div></div><div class="credentials">${credentialRow('brand', brand, 'บัญชีหลักของแบรนด์')}</div>${deliverySection}${emptyState}${addChannel}</article>`;
  }).join('') || '<div class="state-card">สาขานี้ยังไม่มีข้อมูลแบรนด์</div>';
  const foodstoryContent = foodstoryAccount ? `<div class="foodstory-account-details">${credentialRow('foodstory', foodstoryAccount, 'บัญชี FoodStory ของสาขา')}${foodstoryPinRow('foodstory', foodstoryAccount)}</div>`
    : legacyFoodstory ? `<div class="foodstory-account-details">${credentialRow('channel', legacyFoodstory, 'บัญชี FoodStory ของสาขา')}${foodstoryPinRow('channel', legacyFoodstory)}</div>`
      : `<div class="foodstory-empty"><p>ยังไม่มีบัญชี FoodStory ของสาขานี้</p>${state.data.access.canEdit ? '<button id="addFoodstoryButton" class="button primary" type="button">+ เพิ่มบัญชี FoodStory</button>' : ''}</div>`;
  $('#foodstoryPanel').innerHTML = `<div class="foodstory-heading"><img class="foodstory-logo" src="./branch-access-assets/apps/w-pos.jpeg" alt=""><div><h3>FoodStory</h3><span>POS ACCOUNT · บัญชีประจำสาขา</span></div></div>${foodstoryContent}`;
  $('#brandList').innerHTML = brandCards;
  $('#branchView').hidden = false;
  $('#editBranchButton').hidden = !state.data.access.canEdit;
  $('#addBrandButton').disabled = BRAND_OPTIONS.every((option) => brands.some((brand) => brand.name === option.name));
  renderBranches();
}

async function revealCredential(kind, id, field = 'password') {
  const key = field === 'password' ? `${kind}:${id}` : `${kind}:${id}:${field}`;
  if (state.revealed.has(key)) {
    state.revealed.delete(key);
    renderSelectedBranch();
    return;
  }
  const { response, data } = await api('/api/branch-access-credential', { method: 'POST', body: JSON.stringify({ kind, id, field }) });
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถอ่านรหัสผ่านได้');
  state.revealed.set(key, data[field]);
  renderSelectedBranch();
}

const FIELD_LABELS = {
  branch: [['code', 'รหัสสาขา'], ['name', 'ชื่อสาขา'], ['address', 'ที่อยู่'], ['phone', 'เบอร์โทรศัพท์'], ['coordinates', 'พิกัดหรือลิงก์แผนที่']],
  brand: [['name', 'ชื่อแบรนด์'], ['code', 'รหัสแบรนด์'], ['login_identifier', 'อีเมลหรือชื่อผู้ใช้'], ['password', 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)']],
  channel: [['name', 'ชื่อช่องทางขาย'], ['login_identifier', 'อีเมลหรือชื่อผู้ใช้'], ['password', 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)']],
  foodstory: [['login_identifier', 'อีเมลหรือชื่อผู้ใช้'], ['password', 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)'], ['wongnai_pos_pin', 'รหัส 4 ตัว Wongnai pos']],
};

const CREATE_REQUIRED = {
  branch: new Set(['code', 'name']),
  brand: new Set(['name', 'code', 'login_identifier', 'password']),
  channel: new Set(['name', 'login_identifier', 'password']),
  foodstory: new Set(['login_identifier', 'password']),
};

function editorFields(kind, row = {}, create = false) {
  const fields = kind === 'channel' && isFoodstory(row.name) ? FIELD_LABELS.foodstory : FIELD_LABELS[kind];
  return fields.map(([field, label]) => {
    if (field === 'wongnai_pos_pin') {
      return `<label>${label}<input name="wongnai_pos_pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" placeholder="ตัวเลข 4 หลัก" aria-label="${label}" aria-describedby="wongnaiPinHelp"><small id="wongnaiPinHelp" class="pin-help">${create ? 'เว้นว่างไว้ก่อนได้ หากยังไม่มีรหัส' : 'เว้นว่างหากไม่ต้องการเปลี่ยนรหัส 4 ตัว'}</small></label>`;
    }
    if (create && field === 'name' && kind !== 'branch') {
      const branchBrands = state.data.brands.filter((brand) => brand.branch_id === state.selectedBranchId);
      const options = kind === 'brand' ? BRAND_OPTIONS.map((option) => ({
        name: option.name,
        disabled: branchBrands.some((brand) => brand.name === option.name),
      })) : CHANNEL_OPTIONS.filter((name) => !isFoodstory(name)).map((name) => ({ name, disabled: !availableChannels(state.editTarget.brandId).includes(name) }));
      return `<label>${label}<select name="name" required><option value="" disabled selected>เลือก${kind === 'brand' ? 'แบรนด์' : 'ช่องทางขาย'}</option>${options.map((option) => `<option value="${escapeHtml(option.name)}"${option.disabled ? ' disabled' : ''}>${escapeHtml(option.name)}${option.disabled ? ' (เพิ่มแล้ว)' : ''}</option>`).join('')}</select></label>`;
    }
    if (create && kind === 'brand' && field === 'code') {
      return '<label>รหัสแบรนด์ (อัตโนมัติ)<input id="generatedBrandCode" name="code" readonly placeholder="เลือกแบรนด์เพื่อแสดงรหัส"></label>';
    }
    const password = field === 'password';
    const displayLabel = create && password ? 'รหัสผ่าน' : label;
    const required = create && CREATE_REQUIRED[kind]?.has(field) ? ' required' : '';
    return `<label>${displayLabel}<input name="${field}" value="${password ? '' : escapeHtml(row[field] || '')}"${password ? ' type="password" autocomplete="new-password"' : ''}${required}></label>`;
  }).join('');
}

function openEditor(kind, id) {
  if (!state.data.access.canEdit) return;
  const collection = kind === 'branch' ? state.data.branches : kind === 'brand' ? state.data.brands : kind === 'foodstory' ? state.data.foodstory : state.data.channels;
  const row = collection.find((item) => item.id === id);
  if (!row) return;
  state.editTarget = { mode: 'edit', kind, id };
  $('#dialogMode').textContent = 'ADMIN EDIT';
  $('#editTitle').textContent = kind === 'branch' ? 'แก้ไขข้อมูลสาขา' : kind === 'brand' ? 'แก้ไขบัญชีแบรนด์' : kind === 'foodstory' || isFoodstory(row.name) ? 'แก้ไขบัญชี FoodStory' : 'แก้ไขช่องทางขาย';
  $('#formContext').hidden = true;
  $('#editFields').innerHTML = editorFields(kind, row);
  $('#editError').hidden = true;
  $('#editDialog').showModal();
}

function openCreator(kind, brandId = null) {
  if (!state.data.access.canEdit || (kind !== 'branch' && !state.selectedBranchId)) return;
  const branch = state.data.branches.find((row) => row.id === state.selectedBranchId);
  const brand = state.data.brands.find((row) => row.id === brandId && row.branch_id === branch?.id);
  if (kind === 'channel' && (!brand || !availableChannels(brandId).length)) return;
  if (kind === 'foodstory') {
    const branchBrandIds = new Set(state.data.brands.filter((row) => row.branch_id === branch.id).map((row) => row.id));
    if (state.data.foodstory?.some((row) => row.branch_id === branch.id) || state.data.channels.some((row) => branchBrandIds.has(row.brand_id) && isFoodstory(row.name))) return;
  }
  state.editTarget = { mode: 'create', kind, branchId: kind !== 'branch' ? state.selectedBranchId : null, brandId };
  $('#dialogMode').textContent = 'ADMIN CREATE';
  $('#editTitle').textContent = kind === 'branch' ? 'เพิ่มสาขา' : kind === 'brand' ? 'เพิ่มแบรนด์ในสาขานี้' : kind === 'foodstory' ? 'เพิ่มบัญชี FoodStory ของสาขา' : 'เพิ่มช่องทางขาย';
  $('#formContext').textContent = kind === 'channel' ? `${brand.name} · ${branch.name} (${branch.code})` : branch ? `${branch.name} (${branch.code})` : '';
  $('#formContext').hidden = kind === 'branch';
  $('#editFields').innerHTML = editorFields(kind, {}, true);
  $('#editError').hidden = true;
  $('#editDialog').showModal();
}

async function saveEdit(event) {
  event.preventDefault();
  const { mode, kind, id, branchId, brandId } = state.editTarget || {};
  if (!kind || (mode !== 'create' && !id)) return;
  const changes = Object.fromEntries(new FormData(event.currentTarget));
  $('#saveButton').disabled = true;
  const create = mode === 'create';
  const values = create && (kind === 'brand' || kind === 'foodstory') ? { ...changes, branch_id: branchId } : create && kind === 'channel' ? { ...changes, brand_id: brandId } : changes;
  const payload = create ? { entity: kind, values } : { entity: kind, id, changes };
  try {
    const { response, data } = await api('/api/branch-access', { method: create ? 'POST' : 'PATCH', body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(data.message || 'บันทึกข้อมูลไม่สำเร็จ');
    $('#editDialog').close();
    state.revealed.delete(`${kind}:${id}`);
    state.revealed.delete(`${kind}:${id}:wongnai_pos_pin`);
    showToast(data.message || 'บันทึกข้อมูลแล้ว');
    if (create && kind === 'branch') state.selectedBranchId = Number(data.id);
    await loadData(true);
  } catch (error) {
    $('#editError').textContent = error.message || 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง';
    $('#editError').hidden = false;
  } finally {
    $('#saveButton').disabled = false;
  }
}

async function loadData(keepSelection = false) {
  const { response, data } = await api('/api/branch-access');
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถโหลดข้อมูลได้');
  state.data = data;
  if (!keepSelection || !data.branches.some((row) => row.id === state.selectedBranchId)) state.selectedBranchId = data.branches[0]?.id || null;
  $('#userName').textContent = data.access.displayName || data.access.email;
  $('#adminBadge').hidden = !data.access.canEdit;
  $('#addBranchButton').hidden = !data.access.canEdit;
  $('#addBrandButton').hidden = !data.access.canEdit;
  $('#branchCount').textContent = `${data.branches.length} สาขา · ${data.brands.length} แบรนด์ · ${data.channels.length + (data.foodstory?.length || 0)} ช่องทาง`;
  $('#loadingState').hidden = true;
  renderBranches();
  renderSelectedBranch();
}

$('#branchSearch').addEventListener('input', renderBranches);
$('#branchList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-branch-id]');
  if (!button) return;
  state.selectedBranchId = Number(button.dataset.branchId);
  renderSelectedBranch();
});
function handleAccountClick(event) {
  const reveal = event.target.closest('[data-reveal-kind]');
  const edit = event.target.closest('[data-edit-kind]');
  const addChannel = event.target.closest('[data-add-channel-brand-id]');
  if (reveal) revealCredential(reveal.dataset.revealKind, Number(reveal.dataset.revealId), reveal.dataset.revealField || 'password').catch((error) => showToast(error.message, 'error'));
  if (edit) openEditor(edit.dataset.editKind, Number(edit.dataset.editId));
  if (addChannel) openCreator('channel', Number(addChannel.dataset.addChannelBrandId));
  if (event.target.closest('#addFoodstoryButton')) openCreator('foodstory');
}
$('#brandList').addEventListener('click', handleAccountClick);
$('#foodstoryPanel').addEventListener('click', handleAccountClick);
$('#editBranchButton').addEventListener('click', () => openEditor('branch', state.selectedBranchId));
$('#addBranchButton').addEventListener('click', () => openCreator('branch'));
$('#addBrandButton').addEventListener('click', () => openCreator('brand'));
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $('#editDialog').close()));
$('#editForm').addEventListener('submit', saveEdit);
$('#editFields').addEventListener('change', (event) => {
  if (state.editTarget?.mode !== 'create' || state.editTarget.kind !== 'brand' || event.target.name !== 'name') return;
  const branch = state.data.branches.find((row) => row.id === state.editTarget.branchId);
  $('#generatedBrandCode').value = brandCode(event.target.value, branch?.code);
});

loadData().catch((error) => {
  $('#loadingState').hidden = true;
  $('#errorState').hidden = false;
  $('#errorState').textContent = error.message;
});
