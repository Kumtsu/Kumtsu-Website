import { api, clearSession, requireSession, showToast } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');

const BRANCHES = [
  'สุขุมวิท 31', 'ราชเทวี', 'สาทร', 'เกษตร', 'ปิ่นเกล้า', 'โชคชัย 4', 'อารีย์', 'รัชดา', 'อ่อนนุช', 'สามัคคี',
  'หัวหมาก', 'รัตนาธิเบศร์ 22', 'วงเวียนใหญ่', 'แบริ่ง', 'ศรีนครินทร์', 'พัฒนาการ', 'บางแค', 'เพชรเกษม48', 'สรงประภา', 'ราชพฤกษ์-สวนผัก32',
  'ประชาอุทิศ', 'เคหะร่มเกล้า', 'เมืองเอก', 'ลาดกระบัง', 'ศาลายา', 'สายลม', 'ธรรมศาสตร์ รังสิต', 'ลาดพร้าว101', 'เยาวราช(franchise)', 'พระราม5(franchise)',
  'กาดรวมโชค', 'สถานีรถไฟเชียงใหม่', 'นิมมาน', 'หน้าเมือง', 'กังสดาล', 'โคราช', 'พระราม 9', 'อุดร', 'ประชาชื่น 36', 'แจ้งวัฒนะ - ปากเกร็ด 36',
  'บางแสน', 'บางพลี(franchise)', 'เพชรเกษม 69(franchise)', 'ยิ่งเจริญ', 'มมส.(franchise)', 'พระราม 3', 'สามย่าน', 'ลาดปลาเค้า', 'สนามจันทร์', 'รังสิต คลอง 3',
];
const HEAD_OFFICE = 'สำนักงานใหญ่';
const SELECTABLE_BRANCHES = [...BRANCHES, HEAD_OFFICE];
const STATUS_LABELS = { waiting: 'รอดำเนินการ', progress: 'กำลังดำเนินการ', overdue: 'เกินกำหนด', approval: 'รออนุมัติปิดงาน', completed: 'ปิดงานแล้ว', cancelled: 'ยกเลิกแล้ว' };
const TECHNICIANS = [
  { value: 'นอส', name: 'อนวัช เพ็งมีศรี (นอส)' },
  { value: 'เอฟ', name: 'กนกพล น้อยเพ็ง (เอฟ)' },
  { value: 'ขวัญ', name: 'ปริญญา ปัญญายงค์ (ขวัญ)' },
];
const OTHER_BRANCH = 'สาขาอื่นๆ';
const $ = (id) => document.getElementById(id);
let jobs = [];
let canManage = false;
let technicianKey = null;
let selectedJobId = null;
let editingJobId = null;
let displayedMonth = new Date();
let selectedTechnicianValues = new Set();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthJobs() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  return jobs.filter((job) => {
    const date = new Date(`${job.scheduled_date}T00:00:00`);
    return date.getFullYear() === year && date.getMonth() === month;
  });
}

function matchesBranchFilter(jobBranch, filterBranch) {
  if (filterBranch === 'all') return true;
  if (filterBranch === OTHER_BRANCH) return !SELECTABLE_BRANCHES.includes(jobBranch);
  return jobBranch === filterBranch;
}

function filteredJobs() {
  const query = $('search').value.trim().toLowerCase();
  const branch = $('branchFilter').value;
  const technician = $('technicianFilter').value;
  const status = $('statusFilter').value;
  return monthJobs().filter((job) => {
    const matchesBranch = matchesBranchFilter(job.branch, branch);
    return (
    (!query || `${job.title} ${job.description} ${job.branch} ${job.job_type}`.toLowerCase().includes(query))
    && matchesBranch
    && (technician === 'all' || (job.assigned_to || []).includes(technician))
    && (status === 'all' ? !['completed', 'cancelled'].includes(job.status) : job.status === status));
  });
}

function renderStats() {
  const current = monthJobs();
  $('totalStat').textContent = current.filter((job) => !['completed', 'cancelled'].includes(job.status)).length;
  Object.keys(STATUS_LABELS).forEach((status) => { $(`${status}Stat`).textContent = current.filter((job) => job.status === status).length; });
  document.querySelectorAll('.stat').forEach((card) => card.classList.toggle('active', card.dataset.status === $('statusFilter').value));
}

function renderJobList(visible) {
  const status = $('statusFilter').value;
  $('jobListTitle').textContent = status === 'all' ? 'รายการงานที่กำลังใช้งานเดือนนี้' : `${STATUS_LABELS[status]} เดือนนี้`;
  $('jobList').innerHTML = visible.length ? visible.map((job) => `<button type="button" class="job-list-item ${job.status}" data-job-id="${job.id}"><span><b>${escapeHtml(job.title)}</b><small>${escapeHtml(job.branch)} · ${escapeHtml(job.scheduled_date)} เวลา ${escapeHtml(String(job.scheduled_time || '').slice(0, 5))} น.</small></span><span>${escapeHtml((job.assigned_to || []).join(', ') || 'ยังไม่ระบุช่าง')}</span></button>`).join('') : `<p class="empty-state">ไม่พบงานในหมวด “${escapeHtml(status === 'all' ? 'งานที่กำลังใช้งาน' : STATUS_LABELS[status])}” สำหรับเดือนนี้</p>`;
}

function renderFilters() {
  const customBranches = [...new Set(jobs.map((job) => job.branch).filter((branch) => !SELECTABLE_BRANCHES.includes(branch)))].sort((a, b) => a.localeCompare(b, 'th'));
  const branches = [...SELECTABLE_BRANCHES, OTHER_BRANCH, ...customBranches];
  const filterValue = $('branchFilter').value;
  $('branchFilter').innerHTML = '<option value="all">ทุกสาขา</option>' + branches.map((branch) => `<option>${escapeHtml(branch)}</option>`).join('');
  $('branchFilter').value = branches.includes(filterValue) ? filterValue : 'all';
  $('branchOptions').innerHTML = [...SELECTABLE_BRANCHES, OTHER_BRANCH].map((branch) => `<option value="${escapeHtml(branch)}"></option>`).join('');
}

function validateBranch() {
  const value = $('branch').value.trim();
  const isOther = value === OTHER_BRANCH;
  $('customBranchField').hidden = !isOther;
  $('customBranch').required = isOther;
  const customValue = $('customBranch').value.trim();
  const valid = isOther ? Boolean(customValue) && customValue.length <= 120 : SELECTABLE_BRANCHES.includes(value);
  $('branch').setCustomValidity(SELECTABLE_BRANCHES.includes(value) || isOther ? '' : 'กรุณาเลือกสาขาจากรายการที่กำหนด');
  $('customBranch').setCustomValidity(!isOther || valid ? '' : 'กรุณาระบุชื่อสาขาหรือสถานที่ไม่เกิน 120 ตัวอักษร');
  return valid;
}

function selectedTechnicians() {
  return [...selectedTechnicianValues];
}

function renderTechnicians() {
  const query = $('technicianSearch').value.trim().toLocaleLowerCase('th');
  const visible = TECHNICIANS.filter((technician) => `${technician.name} ${technician.value}`.toLocaleLowerCase('th').includes(query));
  $('technicianOptions').innerHTML = visible.map((technician) => `<label class="technician-choice"><input type="checkbox" name="assignedTo" value="${escapeHtml(technician.value)}" ${selectedTechnicianValues.has(technician.value) ? 'checked' : ''}><span>${escapeHtml(technician.name)}</span></label>`).join('') || '<span class="empty-choice">ไม่พบช่างที่ค้นหา</span>';
}

function validateTechnicians() {
  const values = selectedTechnicians();
  const valid = values.length > 0 && values.every((value) => TECHNICIANS.some((technician) => technician.value === value));
  $('technicianError').textContent = valid ? '' : 'กรุณาเลือกช่างอย่างน้อย 1 คน';
  return valid;
}

function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  $('monthTitle').textContent = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(displayedMonth);
  const visible = filteredJobs();
  const byDate = Object.groupBy ? Object.groupBy(visible, (job) => job.scheduled_date) : visible.reduce((result, job) => { (result[job.scheduled_date] ||= []).push(job); return result; }, {});
  let html = ['อา','จ','อ','พ','พฤ','ศ','ส'].map((day) => `<div class="dow">${day}</div>`).join('');
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const previousDays = new Date(year, month, 0).getDate();
  for (let index = 0; index < 42; index += 1) {
    let day = index - first + 1;
    let muted = false;
    if (day < 1) { day = previousDays + day; muted = true; }
    else if (day > days) { day -= days; muted = true; }
    const dateKey = muted ? '' : isoDate(year, month, day);
    const jobHtml = (byDate[dateKey] || []).map((job) => `<button type="button" class="job ${job.status}" data-job-id="${job.id}" aria-label="ดูรายละเอียด ${escapeHtml(job.title)} สาขา ${escapeHtml(job.branch)}">${escapeHtml(job.branch)} • ${escapeHtml(job.title)}<small>${escapeHtml(String(job.scheduled_time || '').slice(0, 5))} · ${escapeHtml((job.assigned_to || []).join(', ') || STATUS_LABELS[job.status])}</small></button>`).join('');
    html += `<div class="day ${muted ? 'muted' : ''}"><div class="num">${day}</div>${jobHtml}</div>`;
  }
  $('calendar').innerHTML = html;
  renderJobList(visible);
  renderStats();
}

function closeModal(id) { $(id).classList.remove('open'); }

async function load() {
  const { response, data } = await api('/api/maintenance');
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถโหลดระบบงานช่างได้');
  jobs = data.jobs || [];
  canManage = Boolean(data.permissions?.canManage);
  technicianKey = data.permissions?.technicianKey || null;
  $('viewerName').textContent = `${data.profile.first_name} ${data.profile.last_name}`;
  $('viewerRole').textContent = canManage ? `Admin · ${data.profile.email}` : 'ดูข้อมูลได้อย่างเดียว';
  $('openJob').hidden = !canManage;
  renderFilters();
  renderCalendar();
}

$('previousMonth').onclick = () => { displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1); renderCalendar(); };
$('nextMonth').onclick = () => { displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1); renderCalendar(); };
['search','branchFilter','technicianFilter','statusFilter'].forEach((id) => $(id).addEventListener(id === 'search' ? 'input' : 'change', renderCalendar));
$('branch').addEventListener('input', validateBranch);
$('customBranch').addEventListener('input', validateBranch);
$('technicianSearch').addEventListener('input', renderTechnicians);
$('technicianOptions').addEventListener('change', (event) => {
  if (!event.target.matches('input[name="assignedTo"]')) return;
  if (event.target.checked) selectedTechnicianValues.add(event.target.value);
  else selectedTechnicianValues.delete(event.target.value);
  validateTechnicians();
});
document.querySelectorAll('.stat').forEach((card) => card.addEventListener('click', () => { $('statusFilter').value = card.dataset.status; renderCalendar(); }));
$('openJob').onclick = () => { if (!canManage) return; editingJobId = null; $('jobModalTitle').textContent = 'เปิดงานใหม่'; $('saveJob').textContent = 'บันทึกงาน'; $('jobForm').reset(); $('scheduledDate').value = isoDate(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1); $('scheduledTime').value = '09:00'; $('technicianSearch').value = ''; $('customBranch').value = ''; $('customBranchField').hidden = true; $('customBranch').required = false; selectedTechnicianValues = new Set(); renderTechnicians(); validateTechnicians(); $('jobModal').classList.add('open'); };
$('cancelJob').onclick = () => closeModal('jobModal');
$('cancelStatus').onclick = () => closeModal('statusModal');
$('statusModal').addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal('statusModal'); });
$('logout').onclick = () => { clearSession(); location.replace('./login.html'); };

function openJobDetails(jobId) {
  const job = jobs.find((item) => item.id === Number(jobId));
  if (!job) return;
  selectedJobId = job.id;
  $('selectedJobLabel').textContent = `${job.branch} • ${job.title}`;
  $('detailSchedule').textContent = `${job.scheduled_date} เวลา ${String(job.scheduled_time || '').slice(0, 5)} น.`;
  $('detailBranch').textContent = job.branch;
  $('detailTitle').textContent = job.title;
  $('detailDescription').textContent = job.description || '—';
  $('detailTechnicians').textContent = (job.assigned_to || []).join(', ') || '—';
  $('detailStatus').textContent = STATUS_LABELS[job.status] || job.status;
  $('detailCreator').textContent = job.created_by_email || '—';
  $('detailCreatedAt').textContent = job.created_at ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(job.created_at)) : '—';
  $('detailImages').innerHTML = (job.closeout_images || []).length ? `<h3>รูปภาพปิดงาน</h3><div class="closeout-images">${job.closeout_images.map((image) => image.signed_url ? `<a href="${escapeHtml(image.signed_url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(image.signed_url)}" alt="รูปภาพปิดงาน ${escapeHtml(job.title)}"></a>` : '').join('')}</div>` : '';
  const finalStatus = ['completed', 'cancelled'].includes(job.status);
  const canClose = canManage || Boolean(technicianKey && (job.assigned_to || []).includes(technicianKey));
  $('jobAdminActions').hidden = !canClose || finalStatus;
  $('statusAdminControls').hidden = !canManage;
  $('cancelJobButton').hidden = !canManage;
  $('saveStatusButton').hidden = !canManage;
  $('editJobButton').hidden = !canManage;
  $('closeJobButton').disabled = !(job.closeout_images || []).length;
  $('closeImage').value = '';
  if (!finalStatus) $('jobStatus').value = job.status;
  $('statusModal').classList.add('open');
  $('cancelStatus').focus();
}

$('calendar').addEventListener('click', (event) => {
  const element = event.target.closest('.job');
  if (element) openJobDetails(element.dataset.jobId);
});
$('jobList').addEventListener('click', (event) => {
  const element = event.target.closest('.job-list-item');
  if (element) openJobDetails(element.dataset.jobId);
});

$('cancelJobButton').onclick = async () => {
  if (!canManage || !selectedJobId || !confirm('ยืนยันยกเลิกงานนี้? งานจะถูกซ่อนจากปฏิทินงานที่กำลังใช้งาน แต่ยังคงอยู่ในประวัติ')) return;
  $('cancelJobButton').disabled = true;
  try {
    const { response, data } = await api('/api/maintenance', { method: 'PATCH', body: JSON.stringify({ id: selectedJobId, status: 'cancelled' }) });
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถยกเลิกงานได้');
    jobs = jobs.map((job) => job.id === data.job.id ? data.job : job);
    closeModal('statusModal'); renderCalendar(); showToast('ยกเลิกงานและบันทึกประวัติเรียบร้อยแล้ว');
  } catch (error) { showToast(error.message, 'error'); }
  finally { $('cancelJobButton').disabled = false; }
};

$('editJobButton').onclick = () => {
  const job = jobs.find((item) => item.id === Number(selectedJobId));
  if (!canManage || !job) return;
  editingJobId = job.id;
  $('jobModalTitle').textContent = 'แก้ไขงาน';
  $('saveJob').textContent = 'บันทึกการแก้ไข';
  const isCustomBranch = !SELECTABLE_BRANCHES.includes(job.branch);
  $('branch').value = isCustomBranch ? OTHER_BRANCH : job.branch;
  $('customBranch').value = isCustomBranch ? job.branch : '';
  $('jobType').value = job.job_type;
  $('scheduledDate').value = job.scheduled_date;
  $('scheduledTime').value = String(job.scheduled_time || '').slice(0, 5);
  $('jobTitle').value = job.title;
  $('jobDescription').value = job.description || '';
  $('technicianSearch').value = '';
  selectedTechnicianValues = new Set(job.assigned_to || []);
  validateBranch(); renderTechnicians(); validateTechnicians();
  closeModal('statusModal');
  $('jobModal').classList.add('open');
};

$('uploadImageButton').onclick = async () => {
  const file = $('closeImage').files?.[0];
  if (!selectedJobId || !file) { showToast('กรุณาเลือกรูปภาพก่อนอัปโหลด', 'error'); return; }
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) { showToast('รองรับ JPG, PNG หรือ WebP ขนาดไม่เกิน 3 MB', 'error'); return; }
  $('uploadImageButton').disabled = true;
  try {
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const { response, data } = await api('/api/maintenance-image', { method: 'POST', body: JSON.stringify({ id: selectedJobId, image: { name: file.name, type: file.type, base64: String(dataUrl).split(',')[1] || '' } }) });
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถอัปโหลดรูปได้');
    await load(); openJobDetails(selectedJobId); showToast(data.message);
  } catch (error) { showToast(error.message, 'error'); }
  finally { $('uploadImageButton').disabled = false; }
};

$('closeJobButton').onclick = async () => {
  const job = jobs.find((item) => item.id === Number(selectedJobId));
  if (!job || !(job.closeout_images || []).length) { showToast('กรุณาอัปโหลดรูปภาพอย่างน้อย 1 รูปก่อนปิดงาน', 'error'); return; }
  if (!confirm('ยืนยันปิดงานนี้?')) return;
  $('closeJobButton').disabled = true;
  try {
    const { response, data } = await api('/api/maintenance-close', { method: 'POST', body: JSON.stringify({ id: selectedJobId }) });
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถปิดงานได้');
    closeModal('statusModal'); await load(); showToast(data.message);
  } catch (error) { showToast(error.message, 'error'); }
  finally { $('closeJobButton').disabled = false; }
};

$('jobForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!canManage || !validateBranch() || !validateTechnicians() || !form.reportValidity()) return;
  $('saveJob').disabled = true;
  const payload = { branch: $('branch').value.trim(), customBranch: $('branch').value.trim() === OTHER_BRANCH ? $('customBranch').value.trim() : '', jobType: $('jobType').value, scheduledDate: $('scheduledDate').value, scheduledTime: $('scheduledTime').value, assignedTo: selectedTechnicians(), title: $('jobTitle').value, description: $('jobDescription').value };
  try {
    const method = editingJobId ? 'PATCH' : 'POST';
    const requestPayload = editingJobId ? { ...payload, action: 'edit', id: editingJobId } : payload;
    const { response, data } = await api('/api/maintenance', { method, body: JSON.stringify(requestPayload) });
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถเปิดงานได้');
    if (editingJobId) jobs = jobs.map((job) => job.id === data.job.id ? data.job : job);
    else jobs.push(data.job);
    displayedMonth = new Date(`${data.job.scheduled_date}T00:00:00`);
    closeModal('jobModal');
    form.reset();
    selectedTechnicianValues = new Set();
    editingJobId = null;
    renderFilters(); renderCalendar(); showToast(data.message);
  } catch (error) { showToast(error.message, 'error'); }
  finally { $('saveJob').disabled = false; }
});

$('statusForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canManage || !selectedJobId) return;
  const control = $('jobStatus'); control.disabled = true;
  try {
    const { response, data } = await api('/api/maintenance', { method: 'PATCH', body: JSON.stringify({ id: selectedJobId, status: control.value }) });
    if (!response.ok) throw new Error(data.message || 'ไม่สามารถเปลี่ยนสถานะได้');
    jobs = jobs.map((job) => job.id === data.job.id ? data.job : job);
    closeModal('statusModal'); renderCalendar(); showToast(data.message);
  } catch (error) { showToast(error.message, 'error'); }
  finally { control.disabled = false; }
});

renderTechnicians();
load().catch((error) => showToast(error.message, 'error'));
