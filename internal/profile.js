import { api, clearSession, getSession, requireSession, showToast, token } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');

const form = document.querySelector('#profileForm');
const input = document.querySelector('#avatarInput');
const preview = document.querySelector('#avatarPreview');
let profile;
let config;
let pendingFile = null;

document.querySelector('#logoutButton').addEventListener('click', () => { clearSession(); location.replace('./login.html'); });

async function signedAvatar(path) {
  if (!path) return null;
  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/${config.bucket}/${path}`, {
    method: 'POST', headers: { apikey: config.publishableKey, Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }),
  });
  const data = await response.json();
  return response.ok && data.signedURL ? `${config.supabaseUrl}/storage/v1${data.signedURL}` : null;
}

async function load() {
  const configResponse = await fetch('/api/internal-config');
  config = await configResponse.json();
  if (!configResponse.ok) throw new Error(config.message || 'ระบบสมาชิกยังไม่ได้ตั้งค่า');
  const { response, data } = await api('/api/internal-profile');
  if (!response.ok) throw new Error(data.message || 'โหลดโปรไฟล์ไม่สำเร็จ');
  profile = data.profile;
  if (String(data.user.email || '').toLowerCase() === 'pachara.r@kumtsu.com') document.querySelector('#adminLink').hidden = false;
  form.elements.firstName.value = profile.first_name || '';
  form.elements.lastName.value = profile.last_name || '';
  form.elements.employeeId.value = profile.employee_id || '';
  form.elements.department.value = profile.department || '';
  form.elements.email.value = profile.email || data.user.email || '';
  form.elements.internalPhone.value = profile.internal_phone || '';
  document.querySelector('#headerName').textContent = `${profile.first_name} ${profile.last_name}`;
  document.querySelector('#headerEmployee').textContent = profile.employee_id;
  const avatarUrl = await signedAvatar(profile.avatar_path);
  if (avatarUrl) preview.src = avatarUrl;
}

input.addEventListener('change', () => {
  const file = input.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { input.value = ''; showToast('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { input.value = ''; showToast('รูปภาพต้องมีขนาดไม่เกิน 5 MB', 'error'); return; }
  pendingFile = file;
  preview.src = URL.createObjectURL(file);
});

async function uploadAvatar() {
  if (!pendingFile) return profile.avatar_path || null;
  const extension = pendingFile.type === 'image/png' ? 'png' : pendingFile.type === 'image/webp' ? 'webp' : 'jpg';
  const userId = getSession()?.user?.id || profile.user_id;
  const path = `${userId}/avatar.${extension}`;
  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.bucket}/${path}`, {
    method: 'POST', headers: { apikey: config.publishableKey, Authorization: `Bearer ${token()}`, 'Content-Type': pendingFile.type, 'x-upsert': 'true' }, body: pendingFile,
  });
  if (!response.ok) throw new Error('อัปโหลดรูปโปรไฟล์ไม่สำเร็จ');
  return path;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button'); button.disabled = true; button.textContent = 'กำลังบันทึก…';
  try {
    const values = Object.fromEntries(new FormData(form));
    values.avatarPath = await uploadAvatar();
    const { response, data } = await api('/api/internal-profile', { method: 'PATCH', body: JSON.stringify(values) });
    if (!response.ok) throw new Error(data.message || 'บันทึกโปรไฟล์ไม่สำเร็จ');
    profile = data.profile; pendingFile = null;
    document.querySelector('#headerName').textContent = `${profile.first_name} ${profile.last_name}`;
    showToast(data.message || 'อัปเดตโปรไฟล์สำเร็จ');
  } catch (error) { showToast(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'บันทึกโปรไฟล์ →'; }
});

load().catch((error) => showToast(error.message, 'error'));
