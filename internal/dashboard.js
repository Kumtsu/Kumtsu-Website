import { api, clearSession, requireSession, showToast } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');
document.querySelector('#logoutButton').addEventListener('click', () => { clearSession(); location.replace('./login.html'); });

async function loadDashboard() {
  const { response, data } = await api('/api/internal-profile');
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถตรวจสอบสิทธิ์สมาชิกได้');
  const profile = data.profile;
  document.querySelector('#headerName').textContent = `${profile.first_name} ${profile.last_name}`;
  document.querySelector('#headerEmployee').textContent = profile.employee_id;
  if (String(data.user?.email || profile.email || '').toLowerCase() === 'pachara.r@kumtsu.com') document.querySelector('#adminLink').hidden = false;
}

loadDashboard().catch((error) => showToast(error.message, 'error'));
