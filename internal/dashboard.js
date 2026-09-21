import { api, clearSession, requireSession, showToast } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');
document.querySelector('#logoutButton').addEventListener('click', () => { clearSession(); location.replace('./login.html'); });

async function loadDashboard() {
  const { response, data } = await api('/api/internal-dashboard');
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถตรวจสอบสิทธิ์สมาชิกได้');
  const profile = data.profile;
  document.querySelector('#headerName').textContent = `${profile.first_name} ${profile.last_name}`;
  document.querySelector('#headerEmployee').textContent = profile.employee_id;
  if (String(data.user?.email || profile.email || '').toLowerCase() === 'pachara.r@kumtsu.com') document.querySelector('#adminLink').hidden = false;
  const container = document.querySelector('#systemLinks');
  container.replaceChildren(...data.systems.map((system) => {
    const card = document.createElement(system.url ? 'a' : 'article');
    card.className = `system-card${system.url ? '' : ' is-disabled'}`;
    if (system.url) { card.href = system.url; card.target = '_blank'; card.rel = 'noopener noreferrer'; }
    else card.setAttribute('aria-disabled', 'true');
    const number = document.createElement('span'); number.className = 'system-number'; number.textContent = system.id;
    const content = document.createElement('div');
    const badge = document.createElement('span'); badge.className = `system-badge${system.url ? ' is-live' : ''}`; badge.textContent = system.url ? 'พร้อมใช้งาน' : 'เร็ว ๆ นี้';
    const title = document.createElement('h2'); title.textContent = system.title;
    const description = document.createElement('p'); description.textContent = system.description;
    content.append(badge, title, description);
    const arrow = document.createElement('span'); arrow.className = 'system-arrow'; arrow.setAttribute('aria-hidden','true'); arrow.textContent = system.url ? '↗' : '—';
    card.append(number, content, arrow); return card;
  }));
}

loadDashboard().catch((error) => showToast(error.message, 'error'));
