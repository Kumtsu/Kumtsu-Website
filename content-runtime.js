(async function () {
  const preview = new URLSearchParams(location.search).get('cms-preview') === 'home';
  let content = null;
  try {
    if (preview) content = JSON.parse(sessionStorage.getItem('kumtsu-cms-preview-home') || 'null');
    if (!content) {
      const response = await fetch('/api/content?key=home');
      if (response.ok) content = (await response.json()).content;
    }
  } catch (_) {}
  if (!content) return;

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
  const safeUrl = (value) => { try { const url = new URL(String(value), location.origin); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } };

  if (content.heroSlides?.length) {
    const slides = document.querySelector('.hero-slides');
    const dots = document.querySelector('.hero-pagination');
    slides.innerHTML = content.heroSlides.map((item, index) => `<figure class="hero-slide ${index === 0 ? 'is-active' : ''}"><img src="${esc(safeUrl(item.image))}" alt="${esc(item.alt)}"></figure>`).join('');
    dots.innerHTML = content.heroSlides.map((_, index) => `<button class="hero-dot ${index === 0 ? 'is-active' : ''}" type="button" aria-label="แสดงภาพที่ ${index + 1}" ${index === 0 ? 'aria-current="true"' : ''}></button>`).join('');
    const newSlides = [...slides.children]; const newDots = [...dots.children]; let active = 0; let timer;
    const show = (index) => { active = (index + newSlides.length) % newSlides.length; newSlides.forEach((node,i) => node.classList.toggle('is-active', i === active)); newDots.forEach((node,i) => { node.classList.toggle('is-active', i === active); if (i === active) node.setAttribute('aria-current','true'); else node.removeAttribute('aria-current'); }); };
    const start = () => { clearInterval(timer); if (newSlides.length > 1) timer = setInterval(() => show(active + 1), 5000); };
    newDots.forEach((dot,index) => dot.addEventListener('click', () => { show(index); start(); })); start();
  }

  if (content.about) {
    const lead = document.querySelector('#about .lead');
    const detail = document.querySelector('#about .about-detail');
    if (lead && content.about.lead) lead.textContent = content.about.lead;
    if (detail && content.about.paragraphs?.length) detail.innerHTML = content.about.paragraphs.map((text) => `<p>${esc(text)}</p>`).join('');
  }

  if (content.stories?.length) {
    const wrap = document.querySelector('#vision .wrap');
    if (wrap) wrap.innerHTML = content.stories.map((item) => {
      const image = `<figure class="story-image ${item.imageFit === 'contain' ? 'story-image--contain' : ''}"><img src="${esc(safeUrl(item.image))}" alt="${esc(item.imageAlt)}" loading="lazy"></figure>`;
      const copy = `<article class="story-copy">${item.eyebrow ? `<div class="eyebrow">${esc(item.eyebrow)}</div>` : ''}<h2>${esc(item.title)}</h2>${(item.paragraphs || []).map((text) => `<p>${esc(text)}</p>`).join('')}</article>`;
      return `<div class="story-layout ${item.imageSide === 'left' ? 'story-layout--reversed' : ''} reveal in">${item.imageSide === 'left' ? image + copy : copy + image}</div>`;
    }).join('');
  }

  if (content.brands?.length) {
    const grid = document.querySelector('#brands .brand-grid');
    if (grid) { grid.setAttribute('aria-label', `โลโก้แบรนด์ในเครือ ${content.brands.length} แบรนด์`); grid.innerHTML = content.brands.map((item) => `<article class="brand-card"><div class="brand-art"><img src="${esc(safeUrl(item.logo))}" alt="${esc(item.alt || item.name)}" loading="lazy"></div></article>`).join(''); }
  }

  if (content.franchise) {
    const item = content.franchise;
    const eyebrow = document.querySelector('#franchise .franchise-head .eyebrow');
    const sectionTitle = document.querySelector('#franchise .franchise-head h2');
    const image = document.querySelector('#franchise .franchise-image img');
    const copy = document.querySelector('#franchise .franchise-copy');
    if (eyebrow && item.eyebrow) eyebrow.textContent = item.eyebrow;
    if (sectionTitle && item.title) sectionTitle.textContent = item.title;
    if (image && item.image) { image.src = safeUrl(item.image); image.alt = item.imageAlt || ''; }
    if (copy && (item.heading || item.paragraphs?.length || item.highlights?.length)) copy.innerHTML = `${item.heading ? `<h3>${esc(item.heading)}</h3>` : ''}${(item.paragraphs || []).map((text) => `<p>${esc(text)}</p>`).join('')}${item.highlights?.length ? `<ul class="franchise-list">${item.highlights.map((text) => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}`;
  }

  if (Array.isArray(content.cloudKitchenClients)) {
    const grid = document.querySelector('#cloud-kitchen-clients .client-logo-grid');
    if (grid) {
      grid.setAttribute('aria-label', `โลโก้ลูกค้า Cloud Kitchen ${content.cloudKitchenClients.length} แบรนด์`);
      grid.innerHTML = content.cloudKitchenClients.map((item) => `<article class="client-logo-card"><div class="client-logo-art"><img src="${esc(safeUrl(item.logo))}" alt="${esc(item.alt || item.name)}" loading="lazy"></div><strong>${esc(item.name)}</strong></article>`).join('');
    }
  }
})();
