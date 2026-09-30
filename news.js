(async function () {
  const params = new URLSearchParams(location.search);
  let settings = null;
  try {
    if (params.get('cms-preview') === 'news') settings = JSON.parse(sessionStorage.getItem('kumtsu-cms-preview-news') || 'null');
    if (!settings) {
      const response = await fetch('/api/content?key=news');
      if (response.ok) settings = (await response.json()).content;
    }
  } catch (_) {}
  const fallback = window.KUMTSU_NEWS || [];
  const news = settings?.items?.length ? settings.items.filter((item) => params.get('cms-preview') === 'news' || item.status === 'published').map((item) => ({ ...item, image:item.cover || item.image, date:formatDate(item.date), body:item.body || [] })) : fallback;
  const grid = document.getElementById('newsGrid');
  const detail = document.getElementById('newsDetail');
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' }[c]));
  const safeUrl = (value) => { try { const url = new URL(String(value), location.origin); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } };
  const card = (item) => `<article class="news-card"><a class="news-card-image" href="news-detail.html?id=${encodeURIComponent(item.id)}" aria-label="อ่านข่าว ${esc(item.title)}"><img src="${esc(safeUrl(item.image))}" alt="" loading="lazy"></a><div class="news-card-body"><div class="news-meta"><span>${esc(item.category)}</span><time>${esc(item.date)}</time></div><h2><a href="news-detail.html?id=${encodeURIComponent(item.id)}">${esc(item.title)}</a></h2><p>${esc(item.excerpt)}</p><a class="news-read-more" href="news-detail.html?id=${encodeURIComponent(item.id)}">อ่านเพิ่มเติม <span aria-hidden="true">→</span></a></div></article>`;

  if (grid) {
    grid.innerHTML = news.map(card).join('');
  }

  if (detail) {
    const id = params.get('id');
    const item = news.find((entry) => entry.id === id) || news[0];
    if (!item) return;
    document.title = `${item.title} | Kumtsu`;
    const manual = settings?.relatedMode === 'manual' ? (settings.relatedIds || []).map((relatedId) => news.find((entry) => entry.id === relatedId)).filter(Boolean) : [];
    const related = (manual.length ? manual : news.filter((entry) => entry.id !== item.id)).filter((entry) => entry.id !== item.id).slice(0,3);
    const blocks = item.blocks?.length ? item.blocks : (item.body || []).map((text) => ({ type:'text', text }));
    const article = blocks.map((block) => block.type === 'image' ? `<figure class="news-content-image news-content-image--${['left','right'].includes(block.layout) ? block.layout : 'full'}"><img src="${esc(safeUrl(block.image))}" alt="${esc(block.alt)}" loading="lazy">${block.alt ? `<figcaption>${esc(block.alt)}</figcaption>` : ''}</figure>` : `<p>${esc(block.text)}</p>`).join('');
    detail.innerHTML = `<div class="news-detail-meta"><span>${esc(item.category)}</span><time>${esc(item.date)}</time></div><h1>${esc(item.title)}</h1><p class="news-detail-lead">${esc(item.excerpt)}</p><figure class="news-detail-cover"><img src="${esc(safeUrl(item.image))}" alt="${esc(item.title)}"></figure><div class="news-detail-copy">${article}</div><a class="news-back" href="news.html">← ย้อนกลับไปหน้าข่าวสาร</a>${related.length ? `<section class="related-news"><h2>ข่าวสารอื่น ๆ</h2><div class="news-grid">${related.map(card).join('')}</div></section>` : ''}`;
  }

  const year = document.getElementById('newsYear');
  if (year) year.textContent = new Date().getFullYear();
  function formatDate(value) { if (!value) return ''; const parsed = new Date(`${value}T00:00:00`); return Number.isNaN(parsed.valueOf()) ? value : new Intl.DateTimeFormat('th-TH', { dateStyle:'long' }).format(parsed); }
})();
