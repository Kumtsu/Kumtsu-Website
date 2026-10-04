import { api, requireSession, showToast } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');

const state = { data: null, selectedBranchId: null, editTarget: null, revealed: new Map() };
const $ = (selector) => document.querySelector(selector);
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

function renderSelectedBranch() {
  const branch = state.data.branches.find((row) => row.id === state.selectedBranchId);
  if (!branch) return;
  const brands = state.data.brands.filter((row) => row.branch_id === branch.id);
  const channels = state.data.channels.filter((row) => brands.some((brand) => brand.id === row.brand_id));
  $('#branchCode').textContent = `BRANCH ${branch.code}`;
  $('#branchName').textContent = branch.name;
  $('#branchAddress').textContent = branch.address || 'ยังไม่มีข้อมูลที่อยู่';
  $('#branchPhone').href = branch.phone ? `tel:${branch.phone}` : '#';
  $('#branchPhone strong').textContent = branch.phone || '—';
  $('#branchMap').href = mapUrl(branch.coordinates);
  $('#accountSummary').textContent = `${brands.length} แบรนด์ · ${channels.length} ช่องทางขาย`;
  $('#brandList').innerHTML = brands.map((brand) => {
    const brandChannels = state.data.channels.filter((row) => row.brand_id === brand.id);
    return `<article class="brand-card"><div class="brand-head"><div class="brand-identity"><img class="brand-logo" src="${logoFor(brand.name)}" alt=""><div><h4>${escapeHtml(brand.name)}</h4><span class="brand-code">${escapeHtml(brand.code)}</span></div></div></div><div class="credentials">${credentialRow('brand', brand, 'บัญชีหลักของแบรนด์')}</div><div class="channel-list">${brandChannels.map((channel) => `<div class="channel-row"><div><h5>${escapeHtml(channel.name)}</h5><p>${escapeHtml(channel.login_identifier || '—')}</p></div><div class="row-actions"><button class="mini-button" data-reveal-kind="channel" data-reveal-id="${channel.id}" type="button">${state.revealed.has(`channel:${channel.id}`) ? 'ซ่อน' : 'ดูรหัส'}</button><button class="mini-button admin-only" data-edit-kind="channel" data-edit-id="${channel.id}" type="button"${state.data.access.canEdit ? '' : ' hidden'}>แก้ไข</button></div>${state.revealed.has(`channel:${channel.id}`) ? `<p>รหัสผ่าน: <strong>${escapeHtml(state.revealed.get(`channel:${channel.id}`))}</strong></p>` : ''}</div>`).join('') || '<p class="muted">ไม่มีช่องทางขาย</p>'}</div></article>`;
  }).join('') || '<div class="state-card">สาขานี้ยังไม่มีข้อมูลแบรนด์</div>';
  $('#branchView').hidden = false;
  $('#editBranchButton').hidden = !state.data.access.canEdit;
  renderBranches();
}

async function revealCredential(kind, id) {
  const key = `${kind}:${id}`;
  if (state.revealed.has(key)) {
    state.revealed.delete(key);
    renderSelectedBranch();
    return;
  }
  const { response, data } = await api('/api/branch-access-credential', { method: 'POST', body: JSON.stringify({ kind, id }) });
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถอ่านรหัสผ่านได้');
  state.revealed.set(key, data.password);
  renderSelectedBranch();
}

const FIELD_LABELS = {
  branch: [['code', 'รหัสสาขา'], ['name', 'ชื่อสาขา'], ['address', 'ที่อยู่'], ['phone', 'เบอร์โทรศัพท์'], ['coordinates', 'พิกัดหรือลิงก์แผนที่']],
  brand: [['name', 'ชื่อแบรนด์'], ['code', 'รหัสแบรนด์'], ['login_identifier', 'อีเมลหรือชื่อผู้ใช้'], ['password', 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)']],
  channel: [['name', 'ชื่อช่องทางขาย'], ['login_identifier', 'อีเมลหรือชื่อผู้ใช้'], ['password', 'รหัสผ่านใหม่ (เว้นว่างหากไม่เปลี่ยน)']],
};

function openEditor(kind, id) {
  if (!state.data.access.canEdit) return;
  const collection = kind === 'branch' ? state.data.branches : kind === 'brand' ? state.data.brands : state.data.channels;
  const row = collection.find((item) => item.id === id);
  if (!row) return;
  state.editTarget = { kind, id };
  $('#editTitle').textContent = kind === 'branch' ? 'แก้ไขข้อมูลสาขา' : kind === 'brand' ? 'แก้ไขบัญชีแบรนด์' : 'แก้ไขช่องทางขาย';
  $('#editFields').innerHTML = FIELD_LABELS[kind].map(([field, label]) => `<label>${label}<input name="${field}" value="${field === 'password' ? '' : escapeHtml(row[field] || '')}" ${field === 'password' ? 'type="password" autocomplete="new-password"' : ''}></label>`).join('');
  $('#editError').hidden = true;
  $('#editDialog').showModal();
}

async function saveEdit(event) {
  event.preventDefault();
  const { kind, id } = state.editTarget || {};
  if (!kind || !id) return;
  const changes = Object.fromEntries(new FormData(event.currentTarget));
  $('#saveButton').disabled = true;
  const { response, data } = await api('/api/branch-access', { method: 'PATCH', body: JSON.stringify({ entity: kind, id, changes }) });
  $('#saveButton').disabled = false;
  if (!response.ok) {
    $('#editError').textContent = data.message || 'บันทึกข้อมูลไม่สำเร็จ';
    $('#editError').hidden = false;
    return;
  }
  $('#editDialog').close();
  showToast(data.message || 'บันทึกข้อมูลแล้ว');
  await loadData(true);
}

async function loadData(keepSelection = false) {
  const { response, data } = await api('/api/branch-access');
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถโหลดข้อมูลได้');
  state.data = data;
  if (!keepSelection || !data.branches.some((row) => row.id === state.selectedBranchId)) state.selectedBranchId = data.branches[0]?.id || null;
  $('#userName').textContent = data.access.displayName || data.access.email;
  $('#adminBadge').hidden = !data.access.canEdit;
  $('#branchCount').textContent = `${data.branches.length} สาขา · ${data.brands.length} แบรนด์ · ${data.channels.length} ช่องทาง`;
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
$('#brandList').addEventListener('click', (event) => {
  const reveal = event.target.closest('[data-reveal-kind]');
  const edit = event.target.closest('[data-edit-kind]');
  if (reveal) revealCredential(reveal.dataset.revealKind, Number(reveal.dataset.revealId)).catch((error) => showToast(error.message, 'error'));
  if (edit) openEditor(edit.dataset.editKind, Number(edit.dataset.editId));
});
$('#editBranchButton').addEventListener('click', () => openEditor('branch', state.selectedBranchId));
$('#editForm').addEventListener('submit', saveEdit);

loadData().catch((error) => {
  $('#loadingState').hidden = true;
  $('#errorState').hidden = false;
  $('#errorState').textContent = error.message;
});
