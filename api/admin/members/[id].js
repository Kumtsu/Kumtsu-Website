const { clean, readJson, requireAdmin, send, serviceSupabase, validEmail } = require('../_admin-utils');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const admin = await requireAdmin(req,res); if (!admin) return;
  const id = clean(req.query.id,80); const kind = req.query.kind === 'request' ? 'request' : 'profile';
  try {
    if (req.method === 'PUT') {
      const body = await readJson(req);
      const values = { first_name:clean(body.firstName,80), last_name:clean(body.lastName,80), employee_id:clean(body.employeeId,30), department:clean(body.department,100), email:clean(body.email,160).toLowerCase(), internal_phone:clean(body.phone,30)||null, status:['active','rejected'].includes(body.status)?body.status:'active', updated_at:new Date().toISOString() };
      if (!values.first_name || !values.last_name || !values.employee_id || !values.department || !validEmail(values.email)) return send(res,400,{message:'ข้อมูลสมาชิกไม่ถูกต้อง'});
      if (kind === 'request') {
        const requestValues = { first_name:values.first_name,last_name:values.last_name,employee_id:values.employee_id,department:values.department,email:values.email,phone:values.internal_phone };
        const result = await serviceSupabase(`/rest/v1/internal_member_requests?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(requestValues)});
        return result.response.ok ? send(res,200,{message:'แก้ไขคำขอสำเร็จ'}) : send(res,400,{message:'แก้ไขคำขอไม่สำเร็จ'});
      }
      if (body.avatarData) {
        const match = String(body.avatarData).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
        if (!match) return send(res, 400, { message: 'ไฟล์รูปโปรไฟล์ไม่ถูกต้อง' });
        const binary = Buffer.from(match[2], 'base64');
        if (binary.length > 5 * 1024 * 1024) return send(res, 400, { message: 'รูปโปรไฟล์ต้องมีขนาดไม่เกิน 5 MB' });
        const extension = match[1] === 'image/png' ? 'png' : match[1] === 'image/webp' ? 'webp' : 'jpg';
        const avatarPath = `${id}/avatar.${extension}`;
        const upload = await serviceSupabase(`/storage/v1/object/internal-profiles/${avatarPath}`, { method: 'POST', headers: { 'Content-Type': match[1], 'x-upsert': 'true' }, body: binary });
        if (!upload.response.ok) return send(res, 400, { message: 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ' });
        values.avatar_path = avatarPath;
      }
      const result = await serviceSupabase(`/rest/v1/internal_profiles?user_id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(values)});
      if (!result.response.ok) return send(res,400,{message:'แก้ไขสมาชิกไม่สำเร็จ'});
      return send(res,200,{message:'แก้ไขสมาชิกสำเร็จ'});
    }
    if (req.method === 'DELETE') {
      if (kind === 'request') {
        const result = await serviceSupabase(`/rest/v1/internal_member_requests?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});
        return result.response.ok ? send(res,200,{message:'ลบคำขอสำเร็จ'}) : send(res,400,{message:'ลบคำขอไม่สำเร็จ'});
      }
      const result = await serviceSupabase(`/auth/v1/admin/users/${encodeURIComponent(id)}`,{method:'DELETE'});
      return result.response.ok ? send(res,200,{message:'ลบสมาชิกสำเร็จ'}) : send(res,400,{message:'ลบสมาชิกไม่สำเร็จ'});
    }
    return send(res,405,{message:'Method not allowed'});
  } catch(error){console.error('[admin-member]',error);return send(res,503,{message:'ระบบขัดข้องชั่วคราว'});}
};
