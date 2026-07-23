# PROJECT_SCOPE.md — Drink Shop Management System (DSMS)

## In Scope (MVP)

- ร้านเครื่องดื่ม 1 สาขา (single branch) แต่ schema เตรียมพร้อมสำหรับหลายสาขา
- สกุลเงิน THB, ภาษาหลักในระบบ: ไทย
- บทบาทผู้ใช้: Owner, Manager, **Shift Supervisor**, Cashier, Employee, **Accountant** (ดู `SECURITY.md`, `DECISIONS.md` D14 — ⚠️ รอยืนยันจากผู้ใช้) — ระบบ invite-only, bootstrap owner คนแรกอัตโนมัติ (ดู `DECISIONS.md` D6)
- โมดูล: Ingredient (+ Unit Conversion), Recipe, Menu (+ Variant/Modifier), Inventory, Purchase, POS (+ Void/Refund + Tax Invoice), Expense, Dashboard, Reports, Settings, User Management
- Compliance ที่ต้องรองรับตั้งแต่ MVP: PDPA (D15), ใบกำกับภาษีอย่างย่อ (D16), Data Retention ≥ 5 ปี (D17)

## Out of Scope (Future / Phase หลัง MVP)

- Multi-branch management UI (schema เตรียมไว้แล้ว แต่ยังไม่เปิดใช้งานจริง) รวมถึง Stock Transfer ระหว่างสาขา (ดู `DECISIONS.md` D11)
- Franchise / central kitchen consolidation
- ระบบบัญชีเต็มรูปแบบ (เชื่อมโปรแกรมบัญชีภายนอก เช่น FlowAccount, PEAK) — MVP มีแค่ Expense เบื้องต้น
- ระบบ Loyalty/CRM ลูกค้า
- Third-party delivery integration (Grab, LineMan)
- Offline-first POS (ดูหมายเหตุด้านล่าง — ยังเป็น Open Question)
- Public/self-service signup (ระบบเป็น invite-only เท่านั้นใน MVP — ดู `DECISIONS.md` D6)
- Partial refund ระดับรายการเดี่ยวในบิล (MVP รองรับ void/refund ระดับทั้งบิลก่อน — ดู `DECISIONS.md` D5)

## Open Question ที่ยังไม่ตัดสิน — ต้องคุยกับ Owner ก่อนเริ่ม Phase 8 (POS)

> ช่องว่างอื่น ๆ ที่เคยเป็น Open Question ได้ตัดสินใจแล้วและบันทึกไว้ใน `DECISIONS.md` (ดู index ท้ายไฟล์นั้น)
> เหลือเพียงข้อเดียวที่จงใจไม่ตัดสินแทนผู้ใช้ เพราะกระทบ conflict-resolution design ทั้งระบบ (Hard Stop ตาม `AGENTS.md` §2):

- **Offline tolerance**: ร้านเครื่องดื่มจริงมักเจอปัญหาเน็ตหลุดที่หน้าร้าน ควรตัดสินใจตั้งแต่ตอนนี้ว่า POS ต้องทำงานได้แบบ offline-tolerant (เช่น queue ธุรกรรมไว้ในเครื่องแล้ว sync ทีหลัง) หรือยอมรับว่าต้องมีเน็ตตลอดเวลาสำหรับ MVP — ถ้าต้องการ offline ต้องออกแบบ conflict resolution ไว้ล่วงหน้า ไม่ใช่เพิ่มทีหลัง

## Success Criteria (MVP)

- เจ้าของร้านเห็นกำไร-ขาดทุนรายวันได้ถูกต้องโดยไม่ต้องคำนวณมือ (นับตามขอบเขต "วันทางธุรกิจ" ที่ตั้งค่าไว้ — ดู `DECISIONS.md` D8)
- พนักงานขายหน้าร้านใช้ POS ได้โดยไม่ต้องอบรมนาน รวมถึงเลือก size/topping และยกเลิกรายการที่กดผิดได้เอง (void ในกะเดียวกัน)
- ต้นทุนสูตร/เมนู/variant/modifier อัปเดตอัตโนมัติเมื่อราคาวัตถุดิบเปลี่ยน
- ข้อมูลย้อนหลังตรวจสอบได้ (auditable) ทุกธุรกรรม รวมถึง void/refund ที่ต้องระบุผู้อนุมัติ
