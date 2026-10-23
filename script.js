const menuButton = document.getElementById('menuButton');
    const navLinks = document.getElementById('navLinks');
    const mainNavHeader = document.getElementById('mainNavHeader');
    const moreMenu = document.getElementById('moreMenu');
    const moreToggle = document.getElementById('moreToggle');
    const morePanel = document.getElementById('morePanel');
    const careerToggle = document.getElementById('careerToggle');
    const careerSubmenu = document.getElementById('careerSubmenu');
    const navTranslations = {
      en: { about: 'About Us', story: 'Our Story', brands: 'Our Brands', franchise: 'Franchise', news: 'News & Events', contact: 'Contact Us', order: 'Order Now ↗' },
      th: { about: 'เกี่ยวกับเรา', story: 'จุดเริ่มต้น', brands: 'แบรนด์ในเครือ', franchise: 'แฟรนไชส์', news: 'ข่าวสาร & กิจกรรม', contact: 'ติดต่อเรา', order: 'สั่งซื้อสินค้า ↗' }
    };
    let navLanguage = 'en';

    function setNavLanguage(language) {
      navLanguage = navTranslations[language] ? language : 'en';
      document.querySelectorAll('[data-nav-key]').forEach(link => {
        link.textContent = navTranslations[navLanguage][link.dataset.navKey];
      });
      document.querySelectorAll('[data-language]').forEach(button => {
        const active = button.dataset.language === navLanguage;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      mainNavHeader.setAttribute('aria-label', navLanguage === 'th' ? 'เมนูหลัก' : 'Main navigation');
      menuButton.setAttribute('aria-label', navLanguage === 'th' ? 'เปิดเมนู' : 'Open menu');
      try { localStorage.setItem('kumtsu-nav-language', navLanguage); } catch (_) {}
    }

    document.querySelectorAll('[data-language]').forEach(button => {
      button.addEventListener('click', () => setNavLanguage(button.dataset.language));
    });
    try { setNavLanguage(localStorage.getItem('kumtsu-nav-language') || 'en'); } catch (_) { setNavLanguage('en'); }
    function setMoreMenu(open) {
      morePanel.classList.toggle('is-open', open);
      morePanel.setAttribute('aria-hidden', String(!open));
      moreToggle.setAttribute('aria-expanded', String(open));
      moreToggle.setAttribute('aria-label', open ? 'ปิดหัวข้อเพิ่มเติม' : 'เปิดหัวข้อเพิ่มเติม');
      if (!open) setCareerSubmenu(false);
    }
    function setCareerSubmenu(open) {
      careerSubmenu.classList.toggle('is-open', open);
      careerSubmenu.setAttribute('aria-hidden', String(!open));
      careerToggle.setAttribute('aria-expanded', String(open));
    }
    moreToggle.addEventListener('click', () => setMoreMenu(moreToggle.getAttribute('aria-expanded') !== 'true'));
    careerToggle.addEventListener('click', () => setCareerSubmenu(careerToggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('click', event => {
      if (!moreMenu.contains(event.target)) setMoreMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        setMoreMenu(false);
        moreToggle.focus();
      }
    });
    menuButton.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', navLanguage === 'th' ? (open ? 'ปิดเมนู' : 'เปิดเมนู') : (open ? 'Close menu' : 'Open menu'));
    });
    navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    }));
    document.getElementById('year').textContent = new Date().getFullYear();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('in'); });
    }, { threshold: .12 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    const hero = document.querySelector('.hero');
    const slides = [...document.querySelectorAll('.hero-slide')];
    const dots = [...document.querySelectorAll('.hero-dot')];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let activeSlide = 0;
    let slideTimer;

    function showSlide(index) {
      activeSlide = (index + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('is-active', i === activeSlide));
      dots.forEach((dot, i) => {
        const active = i === activeSlide;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function stopSlider() { window.clearInterval(slideTimer); }
    function startSlider() {
      stopSlider();
      if (!reduceMotion && !document.hidden) slideTimer = window.setInterval(() => showSlide(activeSlide + 1), 5000);
    }

    dots.forEach((dot, index) => dot.addEventListener('click', () => { showSlide(index); startSlider(); }));
    hero.addEventListener('mouseenter', stopSlider);
    hero.addEventListener('mouseleave', startSlider);
    hero.addEventListener('focusin', stopSlider);
    hero.addEventListener('focusout', startSlider);
    document.addEventListener('visibilitychange', startSlider);
    startSlider();

    const reviewCarousel = document.getElementById('reviewCarousel');
    const reviewTrack = document.getElementById('reviewTrack');
    const reviewSlides = [...document.querySelectorAll('.review-slide')];
    const reviewPagination = document.getElementById('reviewPagination');
    const reviewCurrent = document.getElementById('reviewCurrent');
    const reviewPrev = document.getElementById('reviewPrev');
    const reviewNext = document.getElementById('reviewNext');
    let activeReview = 0;
    let reviewTimer;

    const reviewDots = reviewSlides.map((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'review-dot';
      dot.setAttribute('aria-label', `ดูรีวิวภาพที่ ${index + 1}`);
      dot.addEventListener('click', () => {
        showReview(index);
        startReviewSlider();
      });
      reviewPagination.appendChild(dot);
      return dot;
    });

    function showReview(index) {
      activeReview = (index + reviewSlides.length) % reviewSlides.length;
      reviewCurrent.textContent = String(activeReview + 1).padStart(2, '0');
      reviewSlides.forEach((slide, i) => {
        let slot = (i - activeReview + reviewSlides.length) % reviewSlides.length;
        if (slot > reviewSlides.length / 2) slot -= reviewSlides.length;
        const visible = Math.abs(slot) <= 2;
        slide.classList.toggle('is-visible', visible);
        slide.classList.toggle('is-active', slot === 0);
        const distance = Math.abs(slot);
        const spacing = window.matchMedia('(max-width: 620px)').matches ? 58 : 35;
        const scale = distance === 0 ? 1 : distance === 1 ? .62 : .46;
        slide.style.setProperty('--review-offset', `calc(${slot * spacing}% + ${slot * 10}px)`);
        slide.style.setProperty('--review-scale', String(scale));
        slide.style.zIndex = String(3 - distance);
        slide.setAttribute('aria-hidden', String(!visible));
      });
      reviewDots.forEach((dot, i) => {
        const active = i === activeReview;
        dot.classList.toggle('is-active', active);
        if (active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function stopReviewSlider() { window.clearInterval(reviewTimer); }
    function startReviewSlider() {
      stopReviewSlider();
      if (!reduceMotion && !document.hidden) reviewTimer = window.setInterval(() => showReview(activeReview + 1), 3000);
    }

    reviewPrev.addEventListener('click', () => { showReview(activeReview - 1); startReviewSlider(); });
    reviewNext.addEventListener('click', () => { showReview(activeReview + 1); startReviewSlider(); });
    reviewCarousel.addEventListener('mouseenter', stopReviewSlider);
    reviewCarousel.addEventListener('mouseleave', startReviewSlider);
    reviewCarousel.addEventListener('focusin', stopReviewSlider);
    reviewCarousel.addEventListener('focusout', startReviewSlider);
    document.addEventListener('visibilitychange', startReviewSlider);
    window.addEventListener('resize', () => showReview(activeReview));
    showReview(0);
    startReviewSlider();
