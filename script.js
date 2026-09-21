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

    const branchCoordinates = {
      '04': [13.8330626, 100.570485],
      '06': [13.8143886, 100.5961783],
      '07': [13.7837184, 100.543609],
      '09': [13.7076223, 100.6182255],
      '12': [13.8642746, 100.5046951],
      '13': [13.7262524, 100.4959905],
      '14': [13.6616642, 100.604005],
      '15': [13.6346087, 100.6312229],
      '17': [13.6911942, 100.423401],
      '18': [13.7157202, 100.4441557],
      '19': [13.9261839, 100.5889244],
      '20': [13.7987145, 100.4383766],
      '21': [13.6682749, 100.5048827],
      '22': [13.7711143, 100.7208856],
      '24': [13.7271115, 100.7702423],
      '25': [13.8052012, 100.3213282],
      '26': [13.7830067, 100.5477483],
      '28': [13.7998896, 100.6339335],
      '31': [18.8257634, 99.0117467],
      '35': [16.4800314, 102.8135753],
      '36': [14.9751006, 102.0941244],
      '37': [13.7460026, 100.6364597],
      '39': [13.8397688, 100.5402701],
      '40': [13.8946867, 100.5447591],
      '41': [13.2773174, 100.9299154],
      '42': [13.5959436, 100.7000616],
      '43': [13.7060635, 100.3745836],
      '46': [13.693819, 100.5414391],
      '47': [13.7398537, 100.5251981],
      '48': [13.862209, 100.614551],
      '49': [13.8133835, 100.045692],
      '50': [13.995722, 100.6651763]
    };
    const branchItems = [...document.querySelectorAll('.branch-grid li')];
    const branchMap = document.getElementById('branchMap');
    const mapReset = document.getElementById('mapReset');

    function focusBranch(item) {
      const number = item.querySelector('.branch-no').textContent.trim();
      const name = item.querySelector('span:last-child').textContent.trim();
      const coordinates = branchCoordinates[number];
      const query = coordinates ? coordinates.join(',') : `คุ้มสึ สาขา ${name} ประเทศไทย`;
      branchMap.src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
      branchMap.title = `แผนที่คุ้มสึ สาขา${name}`;
      branchItems.forEach(branch => branch.classList.toggle('is-active', branch === item));
      item.setAttribute('aria-current', 'true');
      branchItems.filter(branch => branch !== item).forEach(branch => branch.removeAttribute('aria-current'));
      if (window.matchMedia('(max-width: 900px)').matches) {
        document.querySelector('.branch-map').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }

    branchItems.forEach(item => {
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.setAttribute('aria-label', `แสดงหมุด${item.querySelector('span:last-child').textContent.trim()}บนแผนที่`);
      item.addEventListener('click', () => focusBranch(item));
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          focusBranch(item);
        }
      });
    });

    mapReset.addEventListener('click', () => {
      branchMap.src = branchMap.dataset.allUrl;
      branchMap.title = 'แผนที่สาขาคุ้มสึทั้งหมด';
      branchItems.forEach(item => {
        item.classList.remove('is-active');
        item.removeAttribute('aria-current');
      });
    });
