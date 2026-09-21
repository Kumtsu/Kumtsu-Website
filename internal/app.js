const form = document.querySelector('#internalRegistrationForm');
const resultBox = document.querySelector('#formResult');
const submitButton = document.querySelector('#submitButton');
const startedAt = document.querySelector('#startedAt');

document.querySelector('#year').textContent = new Date().getFullYear();
startedAt.value = Date.now().toString();

function showResult(message, type) {
  resultBox.hidden = false;
  resultBox.className = `form-result is-${type}`;
  resultBox.textContent = message;
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.consent = formData.get('consent') === 'on';

  submitButton.disabled = true;
  submitButton.textContent = 'กำลังส่งคำขอ…';
  resultBox.hidden = true;

  try {
    const response = await fetch('/api/internal-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = {};
    try { data = await response.json(); } catch (_) { /* use fallback message */ }

    if (!response.ok) {
      throw new Error(data.message || 'ไม่สามารถส่งคำขอได้ กรุณาลองใหม่อีกครั้ง');
    }

    showResult(data.message || 'ส่งคำขอเรียบร้อยแล้ว ฝ่าย IT จะตรวจสอบและติดต่อกลับทางอีเมล', 'success');
    form.reset();
    startedAt.value = Date.now().toString();
  } catch (error) {
    showResult(error.message || 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่ภายหลัง', 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'ส่งคำขอเข้าใช้งาน <span aria-hidden="true">→</span>';
  }
});
