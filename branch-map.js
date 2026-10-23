(() => {
  'use strict';

  const notice = document.getElementById('branchMapNotice');
  const status = document.getElementById('branchMapStatus');
  const origin = window.location.origin;
  const postToParent = message => {
    if (window.parent !== window) window.parent.postMessage(message, origin);
  };
  const showUnavailable = () => {
    notice.hidden = false;
    notice.querySelector('strong').textContent = 'ไม่สามารถโหลดแผนที่ได้ในขณะนี้';
    notice.querySelector('p').textContent = 'กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต คุณยังสามารถเลือกสาขาจากรายชื่อบนหน้าเว็บเพื่อดูที่อยู่และเปิดแผนที่นำทางได้';
  };

  const branches = Array.isArray(window.KumtsuBranchLocations)
    ? window.KumtsuBranchLocations.filter(branch => branch && typeof branch.code === 'string' && Number.isFinite(branch.lat) && Number.isFinite(branch.lng) && Math.abs(branch.lat) <= 90 && Math.abs(branch.lng) <= 180)
    : [];
  if (!window.L || !branches.length) {
    showUnavailable();
    postToParent({ type: 'kumtsu-branch-map-ready' });
    return;
  }

  const map = L.map('branchMapCanvas', { scrollWheelZoom: false });
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
  }).addTo(map);
  const markers = new Map();
  let selectedCode = null;
  let tileLoaded = false;
  tiles.once('tileload', () => { tileLoaded = true; notice.hidden = true; });
  tiles.on('tileerror', () => {
    if (!tileLoaded) showUnavailable();
  });

  function selectMarker(code) {
    for (const [branchCode, marker] of markers) {
      const element = marker.getElement();
      if (!element) continue;
      if (branchCode === code) element.setAttribute('aria-current', 'true');
      else element.removeAttribute('aria-current');
    }
    selectedCode = code;
  }

  function popupFor(branch) {
    const popup = document.createElement('div');
    popup.className = 'branch-popup';
    const title = document.createElement('strong');
    title.textContent = `คุ้มสึ สาขา${branch.name}`;
    const address = document.createElement('p');
    address.textContent = branch.address || 'ยังไม่ระบุที่อยู่';
    const directions = document.createElement('a');
    directions.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${branch.lat},${branch.lng}`)}`;
    directions.target = '_blank';
    directions.rel = 'noopener noreferrer';
    directions.textContent = 'เปิดแผนที่นำทาง ↗';
    popup.append(title, address, directions);
    return popup;
  }

  branches.forEach((branch, index) => {
    const icon = document.createElement('span');
    const number = document.createElement('b');
    number.textContent = String(index + 1).padStart(2, '0');
    icon.append(number);
    const marker = L.marker([branch.lat, branch.lng], {
      icon: L.divIcon({ className: 'branch-marker', html: icon, iconSize: [38, 38], iconAnchor: [19, 42], popupAnchor: [0, -39] }),
      title: `คุ้มสึ สาขา${branch.name}`,
      alt: `หมุดสาขา${branch.name}`,
      keyboard: true
    }).addTo(map).bindPopup(popupFor(branch), { maxWidth: 260, autoPanPaddingTopLeft: [12, 64], autoPanPaddingBottomRight: [12, 12] });
    marker.on('click', () => {
      selectMarker(branch.code);
      status.textContent = `เลือกสาขา${branch.name}`;
      postToParent({ type: 'kumtsu-branch-map-select', code: branch.code });
    });
    markers.set(branch.code, marker);
  });

  function showAll() {
    map.closePopup();
    selectMarker(null);
    map.fitBounds(branches.map(branch => [branch.lat, branch.lng]), { padding: [30, 30], maxZoom: 12, animate: false });
    status.textContent = `แสดงหมุดทั้งหมด ${branches.length} สาขา`;
  }

  window.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== window.parent || !event.data || event.data.type !== 'kumtsu-branch-map-focus') return;
    const code = event.data.code;
    if (code === null) { showAll(); return; }
    if (typeof code !== 'string') return;
    const branch = branches.find(item => item.code === code);
    const marker = markers.get(code);
    if (!branch || !marker) return;
    selectMarker(code);
    map.setView([branch.lat, branch.lng], 16, { animate: false });
    marker.openPopup();
    status.textContent = `แสดงสาขา${branch.name} ${branch.address || ''}`;
  });
  map.on('popupclose', () => {
    if (selectedCode) status.textContent = 'ปิดรายละเอียดหมุดแล้ว';
  });
  window.addEventListener('resize', () => map.invalidateSize({ pan: false }));
  showAll();
  postToParent({ type: 'kumtsu-branch-map-ready' });
})();
