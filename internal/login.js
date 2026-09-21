import { api, getSession, saveSession } from './auth.js';

function nextPage() {
  const requested = new URLSearchParams(location.search).get('next');
  return requested && requested.startsWith('/internal/') && !requested.startsWith('//') ? requested : './dashboard.html';
}

if (getSession()?.access_token) location.replace(nextPage());
const form = document.querySelector('#loginForm');
const result = document.querySelector('#result');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true; button.textContent = 'กำลังตรวจสอบ…'; result.hidden = true;
  const payload = Object.fromEntries(new FormData(form));
  const { response, data } = await api('/api/internal-login', { method: 'POST', body: JSON.stringify(payload) });
  if (response.ok) { saveSession(data); location.replace(nextPage()); return; }
  result.hidden = false; result.className = 'form-result is-error'; result.textContent = data.message || 'เข้าสู่ระบบไม่สำเร็จ';
  button.disabled = false; button.textContent = 'เข้าสู่ระบบ →';
});
