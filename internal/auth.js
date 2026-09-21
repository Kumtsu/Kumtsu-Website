const SESSION_KEY = 'kumtsu_internal_session';

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function token() {
  return getSession()?.access_token || '';
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  let response = await fetch(path, { ...options, headers });
  if (response.status === 401 && !path.includes('login') && !path.includes('refresh')) {
    const refreshToken = getSession()?.refresh_token;
    if (refreshToken) {
      const refreshResponse = await fetch('/api/internal-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
      if (refreshResponse.ok) {
        const refreshed = await refreshResponse.json();
        saveSession(refreshed);
        headers.Authorization = `Bearer ${refreshed.access_token}`;
        response = await fetch(path, { ...options, headers });
      }
    }
  }
  let data = {};
  try { data = await response.json(); } catch (_) { /* fallback below */ }
  if (response.status === 401 && !path.includes('login')) {
    clearSession();
    if (!location.pathname.endsWith('/login.html')) location.replace('./login.html?expired=1');
  }
  return { response, data };
}

export function showToast(message, type = 'success') {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' is-error' : ''}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

export function requireSession() {
  if (!token()) {
    location.replace(`./login.html?next=${encodeURIComponent(location.pathname)}`);
    return false;
  }
  return true;
}
