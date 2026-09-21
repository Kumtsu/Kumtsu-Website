import { api, clearSession, getSession, requireSession, showToast } from '../auth.js';

if (!requireSession()) throw new Error('Authentication required');
if (String(getSession()?.user?.email || '').toLowerCase() !== 'pachara.r@kumtsu.com') {
  location.replace('../profile.html');
  throw new Error('Admin access required');
}

const rows = document.querySelector('#memberRows');
const searchInput = document.querySelector('#searchInput');
const statusFilter = document.querySelector('#statusFilter');
const memberDialog = document.querySelector('#memberDialog');
const deleteDialog = document.querySelector('#deleteDialog');
const memberForm = document.querySelector('#memberForm');
let members = [];
let deleteTarget = null;

document.querySelector('#logoutButton').addEventListener('click', () => { clearSession(); location.replace('../login.html'); });
document.querySelector('#addMemberButton').addEventListener('click', () => openForm());
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => memberDialog.close()));
document.querySelector('[data-close-delete]').addEventListener('click', () => deleteDialog.close());
searchInput.addEventListener('input', render);
statusFilter.addEventListener('change', render);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[character]));
}
function badge(status) {
  const labels = { pending:'Pending', active:'Active', rejected:'Rejected' };
  return `<span class="status-badge is-${status}">${labels[status] || status}</span>`;
}
function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Bangkok' }).format(new Date(value));
}
function filteredMembers() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  return members.filter((member) => (status === 'all' || member.status === status) && (!query || [member.firstName, member.lastName, member.email, member.employeeId, member.department].join(' ').toLowerCase().includes(query)));
}
function render() {
  const counts = { all:members.length, pending:0, active:0, rejected:0 };
  members.forEach((member) => { if (counts[member.status] !== undefined) counts[member.status] += 1; });
  Object.entries(counts).forEach(([key,value]) => { document.querySelector(`#${key}Count`).textContent = value; });
  const list = filteredMembers();
  if (!list.length) { rows.innerHTML = '<tr><td colspan="5" class="empty-row">ไม่พบข้อมูลสมาชิกที่ตรงกับเงื่อนไข</td></tr>'; return; }
  rows.innerHTML = list.map((member) => `<tr><td><div class="member-cell"><span class="member-avatar">${escapeHtml((member.firstName || '?')[0])}</span><span><strong>${escapeHtml(member.firstName)} ${escapeHtml(member.lastName)}</strong><small>${escapeHtml(member.email)}</small></span></div></td><td><strong>${escapeHtml(member.department)}</strong><small>${escapeHtml(member.employeeId)}</small></td><td>${formatDate(member.createdAt)}</td><td>${badge(member.status)}</td><td><div class="row-actions">${member.status === 'pending' ? `<button data-action="approve" data-id="${member.id}">อนุมัติ</button><button class="reject" data-action="reject" data-id="${member.id}">ปฏิเสธ</button>` : ''}<button data-action="edit" data-id="${member.id}">แก้ไข</button><button class="delete" data-action="delete" data-id="${member.id}">ลบ</button></div></td></tr>`).join('');
}
async function loadMembers() {
  rows.innerHTML = '<tr><td colspan="5" class="empty-row">กำลังโหลดข้อมูล…</td></tr>';
  const { response, data } = await api('/api/admin/members');
  if (!response.ok) throw new Error(data.message || 'โหลดรายชื่อสมาชิกไม่สำเร็จ');
  members = data.members || []; render();
}
function openForm(member = null) {
  memberForm.reset();
  memberForm.elements.id.value = member?.id || '';
  memberForm.elements.kind.value = member?.kind || '';
  ['firstName','lastName','employeeId','department','email','phone'].forEach((name) => { memberForm.elements[name].value = member?.[name] || ''; });
  memberForm.elements.status.value = member?.status === 'rejected' ? 'rejected' : 'active';
  document.querySelector('#dialogTitle').textContent = member ? 'แก้ไขสมาชิก' : 'เพิ่มสมาชิก';
  document.querySelector('#passwordField').hidden = Boolean(member);
  document.querySelector('#statusField').hidden = !member || member.kind === 'request';
  document.querySelector('#adminAvatarField').hidden = !member || member.kind === 'request';
  memberDialog.showModal();
}
async function perform(path, method, successMessage, body) {
  const { response, data } = await api(path, { method, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถดำเนินการได้');
  showToast(data.message || successMessage);
  if (data.temporaryPassword) showToast(`เพิ่มสมาชิกแล้ว รหัสผ่านชั่วคราว: ${data.temporaryPassword}`);
  await loadMembers();
}
rows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const member = members.find((item) => item.id === button.dataset.id); if (!member) return;
  if (button.dataset.action === 'edit') return openForm(member);
  if (button.dataset.action === 'delete') { deleteTarget = member; document.querySelector('#deleteMessage').textContent = `ลบ ${member.firstName} ${member.lastName} (${member.employeeId}) ออกจากระบบ?`; deleteDialog.showModal(); return; }
  button.disabled = true;
  try { await perform(`/api/admin/members/${encodeURIComponent(member.id)}/${button.dataset.action}`, 'POST', 'อัปเดตสถานะสำเร็จ'); }
  catch (error) { showToast(error.message, 'error'); button.disabled = false; }
});
memberForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!memberForm.reportValidity()) return;
  const values = Object.fromEntries(new FormData(memberForm));
  delete values.avatar;
  const avatar = memberForm.elements.avatar.files[0];
  if (avatar) {
    if (!['image/jpeg','image/png','image/webp'].includes(avatar.type) || avatar.size > 5 * 1024 * 1024) { showToast('รูปต้องเป็น JPG, PNG หรือ WEBP และไม่เกิน 5 MB', 'error'); return; }
    values.avatarData = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(avatar); });
  }
  const button = memberForm.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const editing = Boolean(values.id);
    const path = editing ? `/api/admin/members/${encodeURIComponent(values.id)}?kind=${encodeURIComponent(values.kind)}` : '/api/admin/members';
    await perform(path, editing ? 'PUT' : 'POST', 'บันทึกข้อมูลสำเร็จ', values);
    memberDialog.close();
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});
document.querySelector('#confirmDeleteButton').addEventListener('click', async () => {
  if (!deleteTarget) return;
  const button = document.querySelector('#confirmDeleteButton'); button.disabled = true;
  try { await perform(`/api/admin/members/${encodeURIComponent(deleteTarget.id)}?kind=${encodeURIComponent(deleteTarget.kind)}`, 'DELETE', 'ลบสมาชิกสำเร็จ'); deleteDialog.close(); deleteTarget = null; }
  catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; }
});

loadMembers().catch((error) => { rows.innerHTML = `<tr><td colspan="5" class="empty-row error-row">${escapeHtml(error.message)}</td></tr>`; showToast(error.message, 'error'); });
