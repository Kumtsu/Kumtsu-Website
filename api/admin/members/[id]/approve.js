const { requireAdmin, send, sendEmail, serviceSupabase, temporaryPassword } = require('../../_admin-utils');

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store'); if(req.method!=='POST')return send(res,405,{message:'Method not allowed'});
  const admin=await requireAdmin(req,res);if(!admin)return;
  const id=String(req.query.id||'').slice(0,80);
  try{
    const requestResult=await serviceSupabase(`/rest/v1/internal_member_requests?id=eq.${encodeURIComponent(id)}&status=eq.pending&select=*`);
    const request=requestResult.data?.[0];if(!request)return send(res,404,{message:'ไม่พบคำขอ Pending'});
    const password=temporaryPassword();
    const authResult=await serviceSupabase('/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:request.email,password,email_confirm:true})});
    if(!authResult.response.ok)return send(res,400,{message:authResult.data.msg||authResult.data.message||'สร้างบัญชีไม่สำเร็จ'});
    const userId=authResult.data.id;
    const profileResult=await serviceSupabase('/rest/v1/internal_profiles',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({user_id:userId,employee_id:request.employee_id,first_name:request.first_name,last_name:request.last_name,department:request.department,email:request.email,internal_phone:request.phone,status:'active'})});
    if(!profileResult.response.ok){await serviceSupabase(`/auth/v1/admin/users/${userId}`,{method:'DELETE'});return send(res,400,{message:'สร้างโปรไฟล์ไม่สำเร็จ อาจมีข้อมูลซ้ำ'});}
    await serviceSupabase(`/rest/v1/internal_member_requests?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'approved',auth_user_id:userId,reviewed_at:new Date().toISOString(),reviewed_by:admin.user.email})});
    const linkResult=await serviceSupabase('/auth/v1/admin/generate_link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'recovery',email:request.email,options:{redirectTo:`${process.env.PUBLIC_SITE_URL||'https://www.kumtsu.com'}/internal/reset-password.html`}})});
    const actionLink=linkResult.data?.properties?.action_link;
    if(actionLink){await sendEmail({from:process.env.APPROVAL_EMAIL_FROM||'Kumtsu Admin <account.it@kumtsu.com>',to:[request.email],subject:'บัญชีระบบภายในคุ้มสึได้รับการอนุมัติแล้ว',html:`<div style="font-family:Arial,sans-serif;padding:28px"><h2>อนุมัติบัญชีเรียบร้อยแล้ว</h2><p>สวัสดี ${request.first_name} ${request.last_name}</p><p>กรุณาตั้งรหัสผ่านใหม่เพื่อเริ่มใช้งานระบบภายใน</p><p><a href="${actionLink}" style="background:#1ca650;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">ตั้งรหัสผ่าน</a></p></div>`},`approved-${id}`);}
    return send(res,200,{message:'อนุมัติสมาชิกและส่งลิงก์ตั้งรหัสผ่านแล้ว'});
  }catch(error){console.error('[approve-member]',error);return send(res,503,{message:'อนุมัติสมาชิกไม่สำเร็จ'});}
};
