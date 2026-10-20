(() => {
  const brandLogo = document.querySelector('.internal-brand img');
  if (brandLogo) brandLogo.src = '/internal/pwa/icon-192.png';
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/internal/sw.js', { scope: '/internal/', updateViaCache: 'none' }).catch(error => console.warn('Kumtsu ALL registration failed', error));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return;
  const panel = document.createElement('aside');
  panel.className = 'pwa-install';
  panel.setAttribute('aria-label', 'ติดตั้ง Kumtsu ALL');
  panel.innerHTML = '<div><strong>Kumtsu ALL</strong><p>เพิ่มระบบงานคุ้มสึไว้บนหน้าจอหลัก</p></div><button type="button">วิธีติดตั้งแอป</button><p class="pwa-help" hidden></p>';
  const button = panel.querySelector('button');
  const help = panel.querySelector('.pwa-help');
  let prompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); prompt = event; button.textContent = 'ติดตั้งแอป';
  });
  button.addEventListener('click', async () => {
    if (prompt) {
      await prompt.prompt();
      const result = await prompt.userChoice;
      prompt = null;
      if (result.outcome === 'accepted') panel.remove();
      else button.textContent = 'วิธีติดตั้งแอป';
      return;
    }
    help.hidden = !help.hidden;
    help.textContent = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'เปิดใน Safari แล้วกดแชร์ → เพิ่มไปยังหน้าจอโฮม → เพิ่ม' : 'เปิดเมนูเบราว์เซอร์ แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก” หากยังไม่พบ ให้เปิดด้วย Chrome หรือ Edge';
  });
  window.addEventListener('appinstalled', () => panel.remove());
  document.querySelector('main')?.append(panel);
})();
