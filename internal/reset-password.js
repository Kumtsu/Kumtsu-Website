import { api, saveSession } from './auth.js';
const params = new URLSearchParams(location.hash.slice(1));
if (params.get('access_token')) saveSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), token_type: 'bearer' });
history.replaceState(null, '', location.pathname);
const form = document.querySelector('#resetForm'); const result = document.querySelector('#result');
form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); if (values.password !== values.confirmPassword) { result.hidden = false; result.className = 'form-result is-error'; result.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; return; } const { response, data } = await api('/api/internal-reset-password', { method: 'POST', body: JSON.stringify({ password: values.password }) }); result.hidden = false; result.className = `form-result is-${response.ok ? 'success' : 'error'}`; result.textContent = data.message || 'ไม่สามารถดำเนินการได้'; if (response.ok) setTimeout(() => location.replace('./login.html'), 1400); });
