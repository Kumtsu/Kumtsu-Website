// Design-preview data stays in this tab. This adapter makes no API requests.
const snapshot = {
  branches: [
    { id: 51, code: 'BR051', name: 'บางนา (ตัวอย่าง)', address: 'ตัวอย่างฟอร์มสำหรับตรวจสอบก่อนเผยแพร่', phone: '', coordinates: '' },
    { id: 1, code: 'BR001', name: 'สุขุมวิท 31 (ตัวอย่าง)', address: 'เลือกสาขานี้เพื่อลองเพิ่มช่องทางขายให้แบรนด์ที่มีอยู่', phone: '', coordinates: '' },
  ],
  brands: [
    { id: 1, branch_id: 1, name: 'คุ้มสึ', code: 'KS001', login_identifier: 'sample@example.com', has_password: true },
    { id: 2, branch_id: 1, name: 'ไก่ทอดแอนโทนี่', code: 'ANT001', login_identifier: 'sample@example.com', has_password: true },
  ],
  channels: [{ id: 1, brand_id: 1, name: 'Grab', login_identifier: 'sample@example.com', has_password: true }],
  access: { canEdit: true, email: 'preview@example.com', displayName: 'ข้อมูลตัวอย่าง' },
};

export function requireSession() { return true; }

export function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = `${message} · เฉพาะตัวอย่างในแท็บนี้`;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 3500);
}

export async function api(path, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  if (path === '/api/branch-access-credential') return { response: { ok: true }, data: { password: 'Sample-Only' } };
  const collection = snapshot[{ branch: 'branches', brand: 'brands', channel: 'channels' }[body.entity]];
  if (options.method === 'POST' && collection) {
    const values = { ...body.values };
    delete values.password;
    const id = Math.max(0, ...collection.map((row) => row.id)) + 1;
    if (body.entity === 'brand') {
      const branch = snapshot.branches.find((row) => row.id === values.branch_id);
      values.code = window.BranchAccessCatalog.brandCode(values.name, branch.code);
    }
    collection.push({ ...values, id, has_password: true });
    return { response: { ok: true }, data: { id, message: 'บันทึกตัวอย่างแล้ว' } };
  }
  if (options.method === 'PATCH' && collection) {
    const changes = { ...body.changes };
    delete changes.password;
    Object.assign(collection.find((row) => row.id === body.id), changes);
    return { response: { ok: true }, data: { message: 'แก้ไขตัวอย่างแล้ว' } };
  }
  return { response: { ok: true }, data: structuredClone(snapshot) };
}
