import { api, requireSession, showToast } from './auth.js';

if (!requireSession()) throw new Error('Authentication required');

const page = window.cloudKitchenPage;
const { enrich, ckOptions, brandLogos, showExtra } = page;

let clients = [];
let canManage = false;
let editingClient = null;
const documentTypeLabels = { contract:'สัญญา Cloud Kitchen', payment:'เอกสารการชำระเงิน', other:'อื่น ๆ' };

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

async function request(path, options = {}) {
  const { response, data } = await api(path, options);
  if (!response.ok) throw new Error(data.message || 'ไม่สามารถเชื่อมต่อระบบได้');
  return data;
}

async function filePayload(file) {
  if (!file) return null;
  if (file.size > 3 * 1024 * 1024) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 3 MB');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  return { name:file.name, type:file.type, base64:String(dataUrl).split(',')[1] || '' };
}

function logo(row) {
  const src = row.logo_url || brandLogos[row.brand];
  return src ? `<img src="${escapeHtml(src)}" alt="โลโก้ ${escapeHtml(row.brand)}">` : `<span class="cloud-logo-fallback">${escapeHtml(row.brand).slice(0,1)}</span>`;
}

function refreshCatalog() {
  ckOptions.splice(0, ckOptions.length, ...clients.map((item) => item.brand));
  clients.forEach((item) => { if (item.logo_url) brandLogos[item.brand] = item.logo_url; });
  if (page.selectedBranch) showExtra(page.selectedBranch);
}

function renderClients() {
  const grid = $('#cloudGrid');
  grid.innerHTML = clients.length ? [...clients].sort((a,b) => a.brand.localeCompare(b.brand,'th')).map((row) => `<button class="cloud-card" data-id="${row.id}">${logo(row)}<b>${escapeHtml(row.brand)}</b><small>${escapeHtml(row.customer || 'ยังไม่ได้ระบุชื่อลูกค้า')}</small><small>${(row.documents || []).length ? `${row.documents.length} เอกสาร` : 'ยังไม่มีเอกสาร'}</small></button>`).join('') : '<div class="cloud-empty">ยังไม่มีแบรนด์ Cloud Kitchen</div>';
  grid.querySelectorAll('[data-id]').forEach((button) => button.onclick = () => showClient(Number(button.dataset.id)));
}

function openDialog() { $('#cloudDialog').classList.add('open'); }
function closeDialog() { $('#cloudDialog').classList.remove('open'); $('#cloudForm').hidden = true; $('#cloudView').innerHTML = ''; editingClient = null; }

function filteredDocuments(row) {
  const query = ($('#documentSearch')?.value || '').trim().toLocaleLowerCase('th');
  const type = $('#documentTypeFilter')?.value || 'all';
  return (row.documents || []).filter((document) => {
    const haystack = `${document.document_name || ''} ${document.original_filename || ''}`.toLocaleLowerCase('th');
    return (type === 'all' || document.document_type === type) && (!query || haystack.includes(query));
  });
}

function renderDocumentList(row) {
  const list = $('#documentList');
  if (!list) return;
  const documents = filteredDocuments(row);
  list.innerHTML = documents.length ? documents.map((document) => `<article class="document-row"><div class="document-main"><b>${escapeHtml(document.document_name)}</b><small>${escapeHtml(documentTypeLabels[document.document_type] || 'อื่น ๆ')} · ${escapeHtml(document.original_filename)}</small></div><div class="document-actions"><a class="secondary" href="${escapeHtml(document.url)}" target="_blank" rel="noopener">เปิดดู</a>${canManage ? `<button class="danger document-delete" data-document-id="${document.id}">ลบ</button>` : ''}</div></article>`).join('') : '<div class="cloud-empty compact">ไม่พบเอกสารที่ตรงกับการค้นหา</div>';
  list.querySelectorAll('.document-delete').forEach((button) => { button.onclick = () => removeDocument(row, Number(button.dataset.documentId)); });
}

function bindDocumentControls(row) {
  $('#documentSearch').oninput = () => renderDocumentList(row);
  $('#documentTypeFilter').onchange = () => renderDocumentList(row);
  if (!canManage) return;
  $('#documentUploadForm').onsubmit = async (event) => {
    event.preventDefault();
    const file = $('#documentFile').files[0];
    if (!file) return showToast('กรุณาเลือกไฟล์ PDF','error');
    try {
      await request('/api/cloud-kitchen', { method:'POST', body:JSON.stringify({ action:'upload', kind:'document', id:row.id, documentName:$('#documentName').value, documentType:$('#documentType').value, file:await filePayload(file) }) });
      await load(); showClient(row.id); showToast('เพิ่มเอกสารเรียบร้อยแล้ว');
    } catch (error) { showToast(error.message,'error'); }
  };
}

function showClient(id) {
  const row = clients.find((item) => item.id === id); if (!row) return;
  editingClient = row;
  $('#cloudForm').hidden = true;
  $('#cloudView').innerHTML = `<div class="cloud-detail-head">${logo(row)}<div><h2>${escapeHtml(row.brand)}</h2><div class="meta">ลูกค้า: ${escapeHtml(row.customer || 'ยังไม่ระบุ')}</div></div></div><div class="section"><div class="section-title">ข้อมูลติดต่อ</div><div>${escapeHtml(row.address || 'ยังไม่ระบุที่อยู่')}</div><div class="meta">โทร. ${escapeHtml(row.phone || 'ยังไม่ระบุ')}</div></div><section class="document-section"><div class="document-heading"><div><h3>เอกสาร</h3><small>${(row.documents || []).length} รายการ</small></div></div><div class="document-tools"><input id="documentSearch" type="search" placeholder="ค้นหาชื่อเอกสารหรือชื่อไฟล์"><select id="documentTypeFilter"><option value="all">ทุกประเภท</option><option value="contract">สัญญา Cloud Kitchen</option><option value="payment">เอกสารการชำระเงิน</option><option value="other">อื่น ๆ</option></select></div>${canManage ? '<form id="documentUploadForm" class="document-upload"><input id="documentName" required maxlength="220" placeholder="ชื่อเอกสาร"><select id="documentType" required><option value="contract">สัญญา Cloud Kitchen</option><option value="payment">เอกสารการชำระเงิน</option><option value="other">อื่น ๆ</option></select><input id="documentFile" required type="file" accept="application/pdf"><button class="primary" type="submit">+ เพิ่มเอกสาร</button></form>' : ''}<div id="documentList" class="document-list"></div></section><div class="cloud-actions">${canManage ? '<button id="editCloud" class="primary">แก้ไขข้อมูล</button><button id="deleteCloud" class="danger">ลบแบรนด์</button>' : ''}<button id="closeCloudDialog" class="secondary">ปิด</button></div>`;
  openDialog();
  bindDocumentControls(row); renderDocumentList(row);
  $('#closeCloudDialog').onclick = closeDialog;
  if (canManage) { $('#editCloud').onclick = () => openForm(row); $('#deleteCloud').onclick = () => removeClient(row); }
}

function openForm(row = null) {
  if (!canManage) return;
  editingClient = row;
  $('#cloudView').innerHTML = ''; $('#cloudForm').hidden = false;
  $('#cloudFormTitle').textContent = row ? 'แก้ไขแบรนด์ Cloud Kitchen' : 'เพิ่มแบรนด์ Cloud Kitchen';
  $('#cfBrand').value = row?.brand || ''; $('#cfCustomer').value = row?.customer || ''; $('#cfAddress').value = row?.address || ''; $('#cfPhone').value = row?.phone || '';
  $('#cfLogo').value = ''; openDialog();
}

async function saveBranch(code, data) {
  await request('/api/cloud-kitchen', { method:'PATCH', body:JSON.stringify({ action:'save-branch', branchCode:code, data }) });
}

async function migrateBrand(oldName, newName) {
  const jobs = [];
  Object.entries(enrich).forEach(([code,data]) => {
    if (!(data.ck || []).includes(oldName)) return;
    data.ck = data.ck.map((name) => name === oldName ? newName : name).filter(Boolean);
    jobs.push(saveBranch(code,data));
  });
  await Promise.all(jobs);
}

async function removeClient(row) {
  if (!confirm(`ยืนยันลบแบรนด์ ${row.brand} ?`)) return;
  await request('/api/cloud-kitchen', { method:'DELETE', body:JSON.stringify({ action:'delete-client', id:row.id }) });
  await migrateBrand(row.brand, ''); clients = clients.filter((item) => item.id !== row.id); refreshCatalog(); renderClients(); closeDialog(); showToast('ลบแบรนด์เรียบร้อยแล้ว');
}

async function removeDocument(row, documentId) {
  const document = (row.documents || []).find((item) => Number(item.id) === documentId);
  if (!document || !confirm(`ยืนยันลบเอกสาร ${document.document_name} ?`)) return;
  try {
    await request('/api/cloud-kitchen', { method:'DELETE', body:JSON.stringify({ action:'delete-document', id:documentId }) });
    await load(); showClient(row.id); showToast('ลบเอกสารเรียบร้อยแล้ว');
  } catch (error) { showToast(error.message,'error'); }
}

$('#cloudForm').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const oldName = editingClient?.brand || '';
    const result = await request('/api/cloud-kitchen', { method:'POST', body:JSON.stringify({ action:'save-client', id:editingClient?.id, brand:$('#cfBrand').value, customer:$('#cfCustomer').value, address:$('#cfAddress').value, phone:$('#cfPhone').value, logoUrl:editingClient?.logo_source || editingClient?.logo_url || '' }) });
    const id = result.client.id;
    if ($('#cfLogo').files[0]) await request('/api/cloud-kitchen', { method:'POST', body:JSON.stringify({ action:'upload', id, kind:'logo', file:await filePayload($('#cfLogo').files[0]) }) });
    if (oldName && oldName !== $('#cfBrand').value.trim()) await migrateBrand(oldName,$('#cfBrand').value.trim());
    await load(); closeDialog(); showToast('บันทึกข้อมูลแบรนด์เรียบร้อยแล้ว');
  } catch (error) { showToast(error.message,'error'); }
};

$('#cloudBtn').onclick = () => { $('#cloudPanel').classList.add('open'); renderClients(); };
$('#closeCloud').onclick = () => $('#cloudPanel').classList.remove('open');
$('#addCloud').onclick = () => openForm();
$('#cancelCloudForm').onclick = closeDialog;
$('#cloudDialog').onclick = (event) => { if (event.target.id === 'cloudDialog') closeDialog(); };

async function load() {
  const data = await request('/api/cloud-kitchen');
  canManage = Boolean(data.permissions?.canManage); clients = data.clients || [];
  Object.entries(data.branches || {}).forEach(([code,value]) => { if (enrich[code]) Object.assign(enrich[code],value); });
  $('#adminBtn').hidden = !canManage; $('#addCloud').hidden = !canManage; refreshCatalog(); renderClients();
  if (canManage) {
    $('#saveAdmin').onclick = async () => {
      if (!page.selectedBranch) return;
      const value = { type:$('#eType').value, staff:Number($('#eStaff').value)||0, am:$('#eAm').value, openTime:$('#eOpenTime').value, closeTime:$('#eCloseTime').value, owned:$('#eOwned').value.split(',').map((x)=>x.trim()).filter(Boolean), ck:$('#eCk').value.split(',').map((x)=>x.trim()).filter(Boolean), status:$('#eStatus').value, capacity:Number($('#eCapacity').value)||0 };
      try { await saveBranch(page.selectedBranch.code,value); Object.assign(enrich[page.selectedBranch.code],value); showExtra(page.selectedBranch); $('#adminForm').classList.remove('open'); showToast('บันทึกข้อมูลสาขาเรียบร้อยแล้ว'); } catch (error) { showToast(error.message,'error'); }
    };
  }
}

load().catch((error) => showToast(error.message,'error'));
