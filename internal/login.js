import { api, getSession, saveSession } from './auth.js';

if (getSession()?.access_token) location.replace('./profile.html');
const form = document.querySelector('#loginForm');
const result = document.querySelector('#result');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true; button.textContent = 'กำลังตรวจสอบ…'; result.hidden = true;
  const payload = Object.fromEntries(new FormData(form));
  const { response, data } = await api('/api/internal-login', { method: 'POST', body: JSON.stringify(payload) });
  if (response.ok) { saveSession(data); location.replace('./profile.html'); return; }
  result.hidden = false; result.className = 'form-result is-error'; result.textContent = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
  button.disabled = false; button.textContent = 'เข้าสู่ระบบ →';
});
