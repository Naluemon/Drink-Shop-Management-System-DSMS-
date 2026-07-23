# UI_UX.md — Drink Shop Management System (DSMS)

## 1. Design System

- **shadcn/ui + Tailwind CSS** เป็นฐานหลัก ห้ามสร้าง custom component ซ้ำกับที่ shadcn มีให้อยู่แล้ว
- Typography, spacing, color token: กำหนดค่าเริ่มต้นใน `tailwind.config` ตั้งแต่ Phase 0 ไม่ปล่อยให้แต่ละหน้าตั้งเอง

## 2. หน้าหลักต่อ Phase (Key Screens)

| Phase           | หน้าจอหลัก                                                                                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | Login, Forgot Password, Accept Invite (ตั้งรหัสผ่านจากลิงก์เชิญ — ดู `DECISIONS.md` D6)                                                                                                                                          |
| User Management | List ผู้ใช้ + สถานะ, Form Invite (เลือก role), Deactivate user                                                                                                                                                                   |
| Ingredient      | List + Search/Filter, Form CRUD, จัดการ Purchase Unit/Conversion Factor (ดู `DECISIONS.md` D2)                                                                                                                                   |
| Recipe          | List, Builder (เลือกวัตถุดิบ + ปริมาณ), Cost Preview แบบ real-time                                                                                                                                                               |
| Menu            | List (grid พร้อมรูป), Form CRUD, จัดการ Variant (Size) + Modifier Group (Topping/ความหวาน/น้ำแข็ง) พร้อม Cost Preview ต่อ variant (ดู `DECISIONS.md` D3)                                                                         |
| Inventory       | Stock movement list (แยกสีตาม stock_in/stock_out/adjustment/reversal), Low stock alert banner, Form Adjustment (บังคับ reason code — จำกัดสิทธิ์ตาม `SECURITY.md`)                                                               |
| POS             | หน้าขายหลัก (ออกแบบให้ใช้งานเร็วด้วยมือเดียว/แตะน้อยที่สุด), ตัวเลือก Variant/Modifier แบบ modal เร็ว, ใบเสร็จ (รวมข้อมูลใบกำกับภาษีอย่างย่อถ้าร้านจด VAT — ดู `DECISIONS.md` D16), ปุ่ม Void (ในกะ) และ Request Refund (ข้ามกะ) |
| Refund Approval | หน้าจอสำหรับ Shift Supervisor (ยอด ≤ threshold) และ Manager/Owner (ยอดเกิน threshold หรือไม่มี Shift Supervisor) อนุมัติคำขอ refund ที่ค้างอยู่ (ดู `DECISIONS.md` D5, D14)                                                      |
| Dashboard       | Widget การ์ดตัวเลขหลัก + กราฟยอดขาย (ยึด "วันทางธุรกิจ" ตาม `DECISIONS.md` D8) — Shift Supervisor เห็นเฉพาะสรุปกะตัวเอง                                                                                                          |
| Reports         | ตัวกรองช่วงเวลา, ตาราง + ปุ่ม Export CSV/PDF — Accountant เห็นเฉพาะแท็บรายงานการเงิน (Sales/Profit/Expense) ไม่เห็น Inventory/Top Menu (ดู `DECISIONS.md` D14)                                                                   |
| Settings        | Tabbed form ตามหมวด (Company/Tax + เลขผู้เสียภาษี/Receipt/Printer/Business Hours/Timezone/Stock Policy/Refund Threshold)                                                                                                         |
| Self-Profile    | ทุก role ดู/แก้ไขชื่อ-อีเมลตนเองได้ (สิทธิตาม PDPA — ดู `DECISIONS.md` D15)                                                                                                                                                      |

## 3. หลักการออกแบบ POS (สำคัญที่สุดเพราะใช้บ่อยที่สุด)

- ปุ่มเมนูต้องกดจากรายการโดยตรง ไม่ต้อง search ในการใช้งานปกติ
- แสดงยอดรวมและเงินทอนชัดเจน ตัวเลขใหญ่
- รองรับการใช้งานบนแท็บเล็ตหน้าร้าน (touch-friendly, ปุ่มขนาดอย่างน้อย 44px)
- **Variant/Modifier selector**: เมื่อกดเมนูที่มี variant (size) หรือ modifier group ที่ `is_required = true` ต้องเปิด modal เลือกทันที ปิด modal ไม่ได้จนกว่าจะเลือกครบตัวเลือกที่บังคับ — ตัวเลือกไม่บังคับ (optional) ข้ามได้ด้วยปุ่มเดียว
- **Stock deficit warning**: ถ้าสต็อกไม่พอ แสดง banner สีเหลือง (ไม่ใช่ error แดง) พร้อมข้อความชัดเจนว่า "สต็อกอาจไม่พอ ต้องการขายต่อหรือไม่" — ปุ่มยืนยันขายต่อต้องกดง่าย ไม่ block flow (ดู `DECISIONS.md` D4)
- **Void button**: ต้องกดยืนยัน 2 ขั้น (ป้องกันกดพลาด) และบังคับเลือก reason ก่อนยืนยัน

## 4. Future Consideration (ไม่บังคับใน MVP)

- **Offline-tolerant POS**: ร้านเครื่องดื่มจริงเจอเน็ตหลุดบ่อย ถ้าต้องการรองรับใน MVP ต้องตัดสินใจไว้ก่อน Phase 8 (ดู `PROJECT_SCOPE.md` — Open Question ที่ยังไม่ตัดสิน)
- Dark mode (ใช้ theme token เดียวกับ Settings > Theme)
- Partial refund ระดับรายการเดี่ยว (ดู `DECISIONS.md` D-Note)

## 5. Accessibility ขั้นต่ำ

- Contrast ratio ผ่าน WCAG AA อย่างน้อยสำหรับหน้าที่ Cashier ใช้ทุกวัน (POS)
- Form ทุกอันมี label ชัดเจน ไม่พึ่ง placeholder แทน label
