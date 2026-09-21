(function () {
  const news = window.KUMTSU_NEWS || [];
  const grid = document.getElementById('newsGrid');
  const detail = document.getElementById('newsDetail');

  if (grid) {
    grid.innerHTML = news.map((item) => `
      <article class="news-card">
        <a class="news-card-image" href="news-detail.html?id=${encodeURIComponent(item.id)}" aria-label="อ่านข่าว ${item.title}">
          <img src="${item.image}" alt="" loading="lazy">
        </a>
        <div class="news-card-body">
          <div class="news-meta"><span>${item.category}</span><time>${item.date}</time></div>
          <h2><a href="news-detail.html?id=${encodeURIComponent(item.id)}">${item.title}</a></h2>
          <p>${item.excerpt}</p>
          <a class="news-read-more" href="news-detail.html?id=${encodeURIComponent(item.id)}">อ่านเพิ่มเติม <span aria-hidden="true">→</span></a>
        </div>
      </article>`).join('');
  }

  if (detail) {
    const id = new URLSearchParams(window.location.search).get('id');
    const item = news.find((entry) => entry.id === id) || news[0];
    if (!item) return;
    document.title = `${item.title} | Kumtsu`;
    detail.innerHTML = `
      <div class="news-detail-meta"><span>${item.category}</span><time>${item.date}</time></div>
      <h1>${item.title}</h1>
      <p class="news-detail-lead">${item.excerpt}</p>
      <figure class="news-detail-cover"><img src="${item.image}" alt="${item.title}"></figure>
      <div class="news-detail-copy">${item.body.map((paragraph) => `<p>${paragraph}</p>`).join('')}</div>
      <a class="news-back" href="news.html">← ย้อนกลับไปหน้าข่าวสาร</a>`;
  }

  const year = document.getElementById('newsYear');
  if (year) year.textContent = new Date().getFullYear();
})();
