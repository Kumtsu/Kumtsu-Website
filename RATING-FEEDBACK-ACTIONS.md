# รายงานแก้ไขรีวิวและการอนุมัติ

เตรียมใน branch `codex/rating-action-evidence` จาก main `de4aaca` วันที่ 5 พฤศจิกายน 2569
สถานะ: โค้ดและ SQL พร้อมตรวจในเครื่อง ยังไม่ apply ฐานข้อมูลจริงหรือ deploy
อ้างอิงงานกลาง: ops_logbook #307 · runbook `kumtsu-it-rating-actions-log`

ผู้ดูแลสาขาเปิดรายละเอียดตรง My Area / Action Required หรือ Customer Feedback
แล้วบันทึกแผน/ความคืบหน้าและผลดำเนินการได้ การบันทึกแผนยังไม่ปิดงาน
เมื่อแก้ไขแล้วต้องมีผลดำเนินการและรูปหลักฐานอย่างน้อยหนึ่งรูปจึงส่งตรวจได้
สถานะจะเป็น `pending_approval` จนกว่า `sittichok.s@kumtsu.com` จะอนุมัติ
หรือส่งกลับพร้อมเหตุผล ผู้ดูทั่วไปอ่านข้อมูลและหลักฐานได้ แต่แก้ไขไม่ได้

- คง Pachara/Krissana เป็น Operations Manager ซึ่งบันทึกได้ทุกสาขา ส่วนการอนุมัติเป็นสิทธิ์คุณสิทธิโชคเท่านั้น
- รูป JPEG/PNG/WebP สูงสุดห้ารูป รูปละ 2 MiB เก็บใน private bucket `rfd-feedback-evidence`
- รูปเปิดผ่าน API ที่ตรวจ active profile และออก signed URL อายุ 60 วินาที
- คำสั่งเปลี่ยนสถานะพร้อมประวัติทำใน transaction เดียว มี revision ป้องกันเขียนทับ
- ยกเลิกติดตามด้วยสถานะ `none` แทนการลบแถว จึงเก็บประวัติไว้
- รายการที่ปิดก่อนใช้ระบบใหม่นี้คงสถานะเดิม และระบุว่าไม่มีข้อมูลผู้อนุมัติเดิม
- ไม่มีการเปลี่ยนหน้า login การ์ดระบบอื่น เส้นทาง หรือข้อมูลรีวิว

## ชุดฐานข้อมูลที่รออนุมัติ

`database/rating-feedback-actions.pending.sql` เพิ่มเก้าคอลัมน์ใน workflow
ขยายสถานะใน workflow/history เพิ่ม RPC แบบ SECURITY INVOKER ที่ให้ service_role เรียกได้เท่านั้น
ถอนสิทธิ์เขียนตรงผ่าน Data API จาก anon/authenticated และตั้ง bucket หลักฐานเป็น private
ไม่มีคำสั่งลบข้อมูลรีวิว workflow หรือ history

นโยบายกลางฉบับ 10 ข้อ 3 กำหนดให้ได้อนุมัติก่อน DDL จึงยังไม่ใช้ชุดนี้บนระบบจริง
เมื่อได้รับอนุมัติ ให้ตรวจ schema อีกครั้ง ใช้ SQL แบบ transaction ก่อน deploy โค้ด
แล้วตรวจการส่งตรวจ/เปิดรูป/อนุมัติจากบัญชีทดสอบที่ผู้ใช้ยืนยัน
เบราว์เซอร์ที่เปิดหน้าเก่าต้องรีเฟรชก่อนบันทึก เพราะ API ใหม่ต้องส่ง revision

หากการนำขึ้นจริงมีปัญหา ให้หยุดการเขียนชั่วคราวโดยคงข้อมูลและ bucket ไว้
ไม่ย้อนกลับไป API เดิมที่อนุญาตปิดงานโดยข้ามการอนุมัติ และไม่ drop คอลัมน์หรือหลักฐาน

ข้อจำกัด: ถ้ารูปอัปโหลดแล้วแต่มีผู้แก้ revision แทรกก่อน transaction จะสำเร็จ
อาจเหลือไฟล์ private ที่ไม่ผูกกับรายการ API ตอบ conflict และไม่แสดงว่าแนบสำเร็จ
ไม่มีการลบไฟล์ของผู้ใช้อัตโนมัติ

## ผลตรวจในเครื่อง

- `node --test tests/*.test.js tests/*.test.cjs`: ผ่าน 151/151
- `node scripts/verify-rating-feedback-sql.cjs <pglite-path>`: ผ่าน 22 กรณีบน PostgreSQL/WASM
  ใช้ @electric-sql/pglite 0.5.15 ที่ตรวจ SHA-512 จาก npm แล้ว แยกไว้ใน temporary directory ไม่เพิ่ม dependency เว็บ
- Browser: ใช้หน้าเว็บ/API จริงกับ PostgreSQL ชั่วคราวและข้อมูลสมมติ
  ตรวจบันทึกแผน, ปฏิเสธส่งไม่ครบ, เลือก/อัปโหลดรูป, ส่งตรวจ, อ่านข้ามบัญชี,
  เปิด private signed image, ประวัติ, เหตุผลส่งกลับ และอนุมัติเสร็จสิ้น
- หน้าจอมือถือ 375px: หน้าไม่ล้น (page width 375, dialog width 341)
- ยังไม่ได้ยืนยันด้วย Storage/API/บัญชีบน production หลัง migration

สำหรับ local QA เท่านั้น มีการแทนระบบ Auth/Storage ด้วยข้อมูลจำลอง
และอนุญาต signed image บน loopback ใน response ของ test server เท่านั้น
ไฟล์ frontend ที่นำขึ้นจริงยังยอมรับเฉพาะ HTTPS Supabase signed image URL
