(() => {
  const branches = window.KumtsuBranchLocations;
  const list = document.querySelector('.branch-grid');
  const frame = document.getElementById('branchMap');
  const reset = document.getElementById('mapReset');
  if (!branches || !list || !frame || !reset) return;
  const items = [...list.querySelectorAll('[data-branch-code]')];
  let selected = null;
  let ready = false;
  function sendSelection() {
    if (ready) frame.contentWindow.postMessage({ type: 'kumtsu-branch-map-focus', code: selected }, location.origin);
  }
  function selectBranch(code, scroll = false) {
    const branch = branches.find(branch => branch.code === code);
    if (code !== null && !branch) return;
    selected = code;
    frame.title = branch ? `แผนที่คุ้มสึ สาขา${branch.name}` : 'แผนที่สาขาคุ้มสึทั้งหมด';
    items.forEach(item => {
      const active = item.dataset.branchCode === code;
      item.classList.toggle('is-active', active);
      item.querySelector('button').setAttribute('aria-pressed', String(active));
    });
    sendSelection();
    if (scroll && window.matchMedia('(max-width: 900px)').matches) frame.closest('.branch-map').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  items.forEach(item => item.querySelector('button').addEventListener('click', () => selectBranch(item.dataset.branchCode, true)));
  reset.addEventListener('click', () => selectBranch(null));
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'kumtsu-branch-map-ready') { ready = true; sendSelection(); }
    if (event.data?.type === 'kumtsu-branch-map-select') selectBranch(event.data.code);
  });
})();
