# REQUIREMENTS.md — Drink Shop Management System (DSMS)

> **Purpose**: แหล่งความจริงเดียวสำหรับ Functional Requirements (FR) และ Non-Functional Requirements (NFR)
> แบบละเอียดระดับ traceable — ใช้เป็น checklist ตอน implement (Maker) และตอนตรวจสอบ (Checker)
> ทุก FR/NFR มี ID ที่อ้างอิงได้ (เช่น `FR-POS-05`, `NFR-PERF-01`) ห้ามเปลี่ยนเลข ID เดิมเมื่อแก้ไขเนื้อหา (append/deprecate แทน)
>
> ที่มาของแต่ละ requirement: `DECISIONS.md` (การตัดสินใจ) และ `IMPLEMENTATION_PLAN.md` (Phase) — เอกสารนี้เป็นตัวเชื่อมระหว่างสองไฟล์นั้น
> ระดับ MoSCoW: **M**=Must, **S**=Should, **C**=Could (ไม่มี Won't เพราะสิ่งที่ไม่ทำอยู่ใน `PROJECT_SCOPE.md` แล้ว)

---

## วิธีใช้เอกสารนี้

- **Maker**: ก่อน implement feature ใด ให้กรองตาราง FR/NFR ด้วย Phase/Module ที่เกี่ยวข้อง แล้ว implement ให้ครบทุกข้อที่ M (Must) อย่างน้อย
- **Checker**: หลัง Maker ส่งงาน ให้ไล่ทีละ FR/NFR ID ที่เกี่ยวข้องกับ Phase นั้น แล้วยืนยันว่า "ผ่าน/ไม่ผ่าน/ไม่เกี่ยวข้อง" พร้อมเหตุผล — ดูกระบวนการเต็มใน `AGENTS.md` §9 (Maker-Checker Workflow)

---

## A. Functional Requirements (FR)

### A1. Authentication & User Bootstrap (Phase 1) — อ่านคู่กับ `DECISIONS.md` D6, D13

| ID         | Requirement                                                                                               | MoSCoW | อ้างอิง        |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| FR-AUTH-01 | ผู้ใช้ล็อกอินด้วย Email/Password ได้                                                                      | M      | SECURITY.md §2 |
| FR-AUTH-02 | ผู้ใช้ล็อกอินด้วย Google OAuth ได้ **เฉพาะ**อีเมลที่มี `user_invites` ผูกไว้แล้ว (ยกเว้น bootstrap owner) | M      | D6             |
| FR-AUTH-03 | มีฟังก์ชัน Forgot Password ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมล                                                 | M      | SECURITY.md §2 |
| FR-AUTH-04 | ผู้ใช้คนแรกที่ signup สำเร็จเมื่อระบบยังไม่มี Owner เลย ต้องได้ role `Owner` โดยอัตโนมัติ (ครั้งเดียว)    | M      | D6             |
| FR-AUTH-05 | Owner/Manager ส่ง invite (email + role) ได้ ผู้ถูกเชิญตั้งรหัสผ่านเองผ่านลิงก์ที่มีวันหมดอายุ             | M      | D6             |
| FR-AUTH-06 | ระบบล็อกบัญชีชั่วคราว 15 นาที หลัง login ผิดติดต่อกัน 5 ครั้ง                                             | M      | D13            |
| FR-AUTH-07 | Session หมดอายุหลัง 8 ชั่วโมง บังคับ re-login                                                             | S      | D13            |
| FR-AUTH-08 | Password ต้องมีอย่างน้อย 8 ตัวอักษร ผสมตัวเลข                                                             | M      | D13            |

### A2. RBAC & User Management (Phase 2) — อ่านคู่กับ `SECURITY.md` §1, `DECISIONS.md` D14 (⚠️ รอยืนยันจากผู้ใช้)

| ID         | Requirement                                                                                                                                               | MoSCoW | อ้างอิง        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| FR-RBAC-01 | ทุก Server Action/Route Handler ต้องตรวจสิทธิ์ตาม RBAC matrix (6 role: Owner/Manager/Shift Supervisor/Cashier/Employee/Accountant) ก่อนแตะ business logic | M      | SECURITY.md §1 |
| FR-RBAC-02 | Manager invite ผู้ใช้ใหม่ได้เฉพาะ role Shift Supervisor/Cashier/Employee (ห้ามยกระดับเป็น Owner/Manager/**Accountant**)                                   | M      | D14            |
| FR-RBAC-03 | Shift Supervisor อนุมัติ refund ได้เองถ้ายอดไม่เกิน `refund_approval_threshold` — เกินต้องส่งต่อ Manager/Owner                                            | M      | D5, D14        |
| FR-RBAC-04 | Accountant เข้าถึงได้เฉพาะ Expense (Create/View) และ Reports การเงิน (View) — เข้า POS/Inventory/Settings/User Management ไม่ได้เด็ดขาด                   | M      | D14            |
| FR-USR-01  | Owner ดู List ผู้ใช้ทั้งหมดพร้อม role และสถานะ active/inactive                                                                                            | M      | —              |
| FR-USR-02  | Owner/Manager (ตามสิทธิ์ที่ระบุใน FR-RBAC-02) invite ผู้ใช้ใหม่ผ่านฟอร์ม (email + role)                                                                   | M      | —              |
| FR-USR-03  | Owner ปิดการใช้งาน (deactivate) ผู้ใช้ได้ทันที (ผู้ใช้ที่ถูกปิดต้อง login ไม่ได้ทันที)                                                                    | M      | —              |
| FR-USR-04  | ผู้ใช้ทุกคนดู/แก้ไขข้อมูลส่วนตัว (ชื่อ, อีเมล) ของตนเองได้ (สิทธิตาม PDPA)                                                                                | M      | D15            |

### A3. Ingredient & Unit Conversion (Phase 3) — อ่านคู่กับ `DECISIONS.md` D1, D2

| ID        | Requirement                                                                                  | MoSCoW | อ้างอิง        |
| --------- | -------------------------------------------------------------------------------------------- | ------ | -------------- |
| FR-ING-01 | CRUD ingredient พร้อม Search/Filter ตามชื่อ/supplier/หมวดหมู่                                | M      | —              |
| FR-ING-02 | กำหนด `base_unit` (gram/ml/piece) ต่อ ingredient หนึ่งค่าตายตัว                              | M      | D2             |
| FR-ING-03 | กำหนด `purchase_unit` + `conversion_factor` ได้หลายรายการต่อ ingredient (`unit_conversions`) | M      | D2             |
| FR-ING-04 | ระบบคำนวณ `cost_per_unit` (ต่อ base_unit) อัตโนมัติ = ราคาซื้อ ÷ conversion factor           | M      | D2             |
| FR-ING-05 | ก่อนมี PO แรกของ ingredient นั้น อนุญาตกรอก `cost_per_unit` มือ (bootstrap value)            | M      | D1             |
| FR-ING-06 | กำหนด low-stock threshold ต่อ ingredient สำหรับใช้เตือนใน Inventory (Phase 6)                | M      | —              |
| FR-ING-07 | ลบ ingredient แบบ soft-delete (`deleted_at`) เท่านั้น                                        | M      | DATABASE.md §4 |

### A4. Recipe (Phase 4)

| ID        | Requirement                                                                                   | MoSCoW | อ้างอิง            |
| --------- | --------------------------------------------------------------------------------------------- | ------ | ------------------ |
| FR-RCP-01 | CRUD recipe พร้อมเลือก ingredient + quantity (หน่วยอ้างอิง base_unit ของ ingredient นั้นเสมอ) | M      | —                  |
| FR-RCP-02 | กำหนด `yield` ต่อ recipe (ผลผลิตที่ได้จาก 1 สูตร)                                             | M      | —                  |
| FR-RCP-03 | คำนวณ recipe cost = Σ(ingredient.cost_per_unit × quantity) ÷ yield โดยอัตโนมัติ               | M      | ARCHITECTURE.md §3 |
| FR-RCP-04 | recipe cost recalculate ทันทีที่ ingredient cost ที่ใช้อยู่เปลี่ยน (ไม่ต้องรอ manual trigger) | M      | ARCHITECTURE.md §3 |

### A5. Menu, Variant & Modifier (Phase 5) — อ่านคู่กับ `DECISIONS.md` D3

| ID         | Requirement                                                                                                  | MoSCoW | อ้างอิง        |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------ | -------------- |
| FR-MENU-01 | CRUD menu (ชื่อ, ราคาตั้งต้น, รูปภาพ, หมวดหมู่, สถานะพร้อมขาย)                                               | M      | —              |
| FR-MENU-02 | ผูก menu กับ recipe หลัก 1 ตัว                                                                               | M      | —              |
| FR-MENU-03 | สร้าง `menu_variant` (เช่น Size S/M/L) พร้อม `recipe_multiplier` หรือ `override_recipe_id` และ `price_delta` | M      | D3             |
| FR-MENU-04 | สร้าง `modifier_group` (เช่น ความหวาน, Topping) กำหนด `selection_type` (single/multiple) และ `is_required`   | M      | D3             |
| FR-MENU-05 | สร้าง `modifier` ในกลุ่ม พร้อมเลือกผูก `ingredient_id`+`quantity` (optional) และ `price_delta`               | M      | D3             |
| FR-MENU-06 | แสดง Cost Preview แบบ real-time ต่อ combination ของ variant/modifier ที่เลือกตอนสร้าง/แก้ menu               | S      | UI_UX.md §2    |
| FR-MENU-07 | ลบ menu/variant/modifier แบบ soft-delete เท่านั้น                                                            | M      | DATABASE.md §4 |

### A6. Inventory (Phase 6) — อ่านคู่กับ `DECISIONS.md` D4, D11, D12

| ID        | Requirement                                                                                         | MoSCoW | อ้างอิง            |
| --------- | --------------------------------------------------------------------------------------------------- | ------ | ------------------ |
| FR-INV-01 | บันทึก `stock_in` ที่ผูกกับ Purchase Order เสมอ                                                     | M      | —                  |
| FR-INV-02 | บันทึก `stock_out` — ถ้าทำโดย Employee ต้องเลือก `reason_code` จากลิสต์ที่กำหนดไว้ล่วงหน้า (บังคับ) | M      | D12                |
| FR-INV-03 | บันทึก `adjustment` (แก้ตัวเลขอิสระ ไม่มีเอกสารอ้างอิง) — **จำกัดสิทธิ์เฉพาะ Manager/Owner**        | M      | D12                |
| FR-INV-04 | แสดง Low Stock Alert banner เมื่อสต็อกต่ำกว่า threshold ที่ตั้งไว้ (FR-ING-06)                      | M      | —                  |
| FR-INV-05 | ทุก movement เป็น append-only แก้ไขผ่าน reversal entry ใหม่เท่านั้น                                 | M      | ARCHITECTURE.md §4 |
| FR-INV-06 | `movement_type = transfer` มีอยู่ใน schema (enum) แต่**ไม่เปิด UI/logic**ใน MVP                     | M      | D11                |

### A7. Purchase (Phase 7)

| ID        | Requirement                                                                         | MoSCoW | อ้างอิง |
| --------- | ----------------------------------------------------------------------------------- | ------ | ------- |
| FR-PUR-01 | CRUD supplier                                                                       | M      | —       |
| FR-PUR-02 | สร้าง Purchase Order เลือก ingredient + purchase_unit + quantity + ราคา             | M      | —       |
| FR-PUR-03 | Receive PO → สร้าง `stock_in` movement + recalculate `cost_per_unit` ด้วย WAC ทันที | M      | D1      |
| FR-PUR-04 | ดูประวัติ PO แยกตาม supplier และช่วงเวลา                                            | S      | —       |

### A8. POS — Sales, Void & Refund (Phase 8) — อ่านคู่กับ `DECISIONS.md` D3, D4, D5, D9

| ID        | Requirement                                                                                                                                                                                                                      | MoSCoW | อ้างอิง                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------- |
| FR-POS-01 | แสดงเมนูเป็นปุ่มกดโดยตรง ไม่ต้อง search ในการใช้งานปกติ                                                                                                                                                                          | M      | UI_UX.md §3            |
| FR-POS-02 | เมื่อเลือกเมนูที่มี modifier group ที่ `is_required = true` ต้องบังคับเลือกก่อนเพิ่มลงตะกร้า                                                                                                                                     | M      | D3                     |
| FR-POS-03 | คำนวณส่วนลดระดับรายการและระดับบิล (ไม่กระทบ cost snapshot)                                                                                                                                                                       | M      | D9                     |
| FR-POS-04 | คำนวณ VAT ตาม `vat_mode`/`vat_rate` ปัจจุบัน แล้ว snapshot ค่า ณ เวลาขาย                                                                                                                                                         | M      | D9                     |
| FR-POS-05 | ปัดเศษยอดรวมสุทธิเป็นหน่วยบาท พร้อมบันทึกผลต่างใน `rounding_adjustment`                                                                                                                                                          | M      | D9                     |
| FR-POS-06 | ชำระเงิน (Cash/QR) และแสดง/พิมพ์ใบเสร็จ — ถ้า `is_vat_registered = true` ต้องมีข้อมูลใบกำกับภาษีอย่างย่อครบตาม D16                                                                                                               | M      | D16                    |
| FR-POS-07 | ยืนยันการขาย → ตัดสต็อก (recipe + modifier ที่กินวัตถุดิบ) + บันทึก cost snapshot ทั้งหมดในธุรกรรมเดียว (atomic transaction)                                                                                                     | M      | ARCHITECTURE.md §3, §7 |
| FR-POS-08 | ถ้าสต็อกไม่พอ แสดง warning แต่**ไม่บล็อก**การขาย พร้อม flag `is_stock_deficit = true`                                                                                                                                            | M      | D4                     |
| FR-POS-09 | Cashier Void รายการได้เองภายในกะเดียวกัน (ก่อน settlement) พร้อม reason บังคับ → คืนสต็อกทันที                                                                                                                                   | M      | D5                     |
| FR-POS-10 | Cashier "Request Refund" ได้สำหรับรายการข้ามกะ แต่กดยืนยันเองไม่ได้                                                                                                                                                              | M      | D5                     |
| FR-POS-11 | Shift Supervisor Approve refund ได้เองถ้ายอด ≤ `refund_approval_threshold`; เกิน threshold หรือไม่มี Shift Supervisor ต้องส่งต่อ Manager/Owner Approve/Reject → ถ้า approve สร้าง reversal entry พร้อม `approved_by` และคืนสต็อก | M      | D5, D14                |
| FR-POS-12 | ทุก void/refund เป็น reversal entry ใหม่ที่อ้างอิงธุรกรรมเดิม ห้าม UPDATE/DELETE ของเดิม                                                                                                                                         | M      | ARCHITECTURE.md §4     |
| FR-POS-13 | เลขที่ใบกำกับภาษี (`tax_invoice_number`) กินเลขเฉพาะ transaction จริงที่ไม่ถูก void ก่อนออกใบเสร็จ เป็น running number ต่อเนื่องไม่ข้าม/ซ้ำ                                                                                      | M      | D16                    |

### A9. Expense (Phase 9)

| ID        | Requirement                                                                                              | MoSCoW | อ้างอิง                 |
| --------- | -------------------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| FR-EXP-01 | CRUD expense category (Rent, Electricity, Salary, Misc, …)                                               | M      | —                       |
| FR-EXP-02 | บันทึก expense entry แบบ append-only พร้อม `created_by` — Owner/Manager/**Accountant** สร้างได้ (ดู D14) | M      | ARCHITECTURE.md §4, D14 |
| FR-EXP-03 | แก้ไข/ลบ expense ทำผ่านรายการปรับปรุง (adjustment) ใหม่เท่านั้น ห้ามลบ record จริง                       | M      | —                       |

### A10. Dashboard (Phase 10) — อ่านคู่กับ `DECISIONS.md` D8

| ID         | Requirement                                                                                                 | MoSCoW | อ้างอิง |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ------ | ------- |
| FR-DASH-01 | แสดง widget: Today's Sales, Profit, Revenue, Best Seller, Low Stock, Expenses, Net Profit                   | M      | —       |
| FR-DASH-02 | ตัวเลข "วันนี้"/"เมื่อวาน" คำนวณตาม business day boundary (`business_day_start_hour`) ไม่ใช่เที่ยงคืนปฏิทิน | M      | D8      |

### A11. Reports (Phase 11) — อ่านคู่กับ `DECISIONS.md` D8, D9, D10

| ID        | Requirement                                                                                                               | MoSCoW | อ้างอิง            |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ |
| FR-RPT-01 | รายงานแบบ Daily/Weekly/Monthly/Yearly (ยึด business day boundary)                                                         | M      | D8                 |
| FR-RPT-02 | รายงาน Top Menu, Profit, Inventory                                                                                        | M      | —                  |
| FR-RPT-03 | Export CSV                                                                                                                | M      | —                  |
| FR-RPT-04 | Export PDF ผ่าน headless Chromium แสดงฟอนต์ไทยถูกต้อง 100%                                                                | M      | D10                |
| FR-RPT-05 | ทุกตัวเลขในรายงาน traceable กลับไป ledger ต้นทางได้ทุกแถว (รวม void/refund/adjustment)                                    | M      | ARCHITECTURE.md §4 |
| FR-RPT-06 | Accountant เห็นเฉพาะรายงานการเงิน (Sales, Profit, Expense) สำหรับใช้เตรียมยื่นภาษี — เข้ารายงาน Inventory/Top Menu ไม่ได้ | M      | D14                |

### A12. Settings (Phase 12) — อ่านคู่กับ `DECISIONS.md` D4, D8, D9, D12, D16

| ID        | Requirement                                                                                              | MoSCoW | อ้างอิง        |
| --------- | -------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| FR-SET-01 | ตั้งค่า Company info, Receipt template, Printer                                                          | M      | —              |
| FR-SET-02 | ตั้งค่า Tax (`vat_mode`, `vat_rate`)                                                                     | M      | D9             |
| FR-SET-03 | ตั้งค่า Timezone + `business_day_start_hour`                                                             | M      | D8             |
| FR-SET-04 | ตั้งค่า Stock Deficit Policy (warn-only เริ่มต้น / บล็อกเข้มงวด) ต่อ ingredient หรือ global              | S      | D4             |
| FR-SET-05 | จัดการ Reason Code master list สำหรับ stock-out/adjustment                                               | M      | D12            |
| FR-SET-06 | ตั้งค่า Business Hours, Theme                                                                            | C      | —              |
| FR-SET-07 | เปลี่ยน setting มีผลกับเอกสาร/ใบเสร็จที่ออกใหม่เท่านั้น ไม่กระทบใบเสร็จเก่า (เพราะเป็น snapshot)         | M      | DATABASE.md §8 |
| FR-SET-08 | ตั้งค่า `is_vat_registered`, `tax_id`, `registered_name`, `registered_address` สำหรับใบกำกับภาษีอย่างย่อ | M      | D16            |
| FR-SET-09 | ตั้งค่า `refund_approval_threshold` สำหรับ Shift Supervisor                                              | M      | D5, D14        |

---

## B. Non-Functional Requirements (NFR)

### B1. Performance

| ID          | Requirement                        | Target/Metric                                             | Verification                           |
| ----------- | ---------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| NFR-PERF-01 | Dashboard โหลดเร็ว                 | < 2 วินาที ภายใต้ข้อมูลจำลอง 1 ปี                         | TESTING.md §5                          |
| NFR-PERF-02 | POS checkout ตอบสนองเร็ว           | < 1 วินาที (P95)                                          | Playwright timing assertion            |
| NFR-PERF-03 | PDF generation ไม่ค้าง             | < 5 วินาที รวม cold-start; ถ้าเกินต้องแยกเป็น async/queue | Manual benchmark ก่อน Phase 11 (D10)   |
| NFR-PERF-04 | Report query ช่วง 1 ปี ตอบสนองเร็ว | < 3 วินาที                                                | ต้องมี index บน (timestamp, branch_id) |

### B2. Scalability & Multi-Branch Readiness

| ID           | Requirement                                  | Target/Metric                                    | Verification            |
| ------------ | -------------------------------------------- | ------------------------------------------------ | ----------------------- |
| NFR-SCALE-01 | ทุกตารางธุรกิจมี `branch_id` ตั้งแต่ Phase 3 | 100% ของตารางใน `DATABASE.md` §5                 | Schema review (Checker) |
| NFR-SCALE-02 | รองรับปริมาณธุรกรรมระดับ production          | ≥ 100,000 sales_transaction_items/ปี ไม่ degrade | Load test ก่อน Phase 14 |

### B3. Availability & Reliability

| ID           | Requirement                                       | Target/Metric                                  | Verification         |
| ------------ | ------------------------------------------------- | ---------------------------------------------- | -------------------- |
| NFR-AVAIL-01 | Production uptime                                 | ≥ 99.5% (SLA ของ Vercel+Supabase)              | Monitoring dashboard |
| NFR-AVAIL-02 | Rollback deployment ทำได้เร็ว                     | ภายใน 5 นาทีจาก Vercel dashboard               | DEPLOYMENT.md §6     |
| NFR-AVAIL-03 | Backup อัตโนมัติ + manual ก่อน breaking migration | Daily backup + pg_dump ก่อนทุก breaking change | DEPLOYMENT.md §4     |

### B4. Security

| ID         | Requirement                                                           | Target/Metric                                                           | Verification          |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------- |
| NFR-SEC-01 | Authorization ตรวจที่ Application Layer เป็นด่านเดียวที่พึ่งพาได้จริง | ทุก Server Action/Route Handler มี `requirePermission` เป็นบรรทัดแรก    | Code review (Checker) |
| NFR-SEC-02 | Secret ไม่รั่วผ่าน client                                             | ไม่มี secret ใน `NEXT_PUBLIC_*` เลย                                     | Grep + code review    |
| NFR-SEC-03 | Password/Lockout policy                                               | ตาม D13                                                                 | Unit test             |
| NFR-SEC-04 | Input validation ครบ                                                  | ทุก input ผ่าน zod schema ก่อนถึง service layer                         | Code review           |
| NFR-SEC-05 | Audit trail ครบ                                                       | ทุก action กระทบเงิน/สต็อกมี `created_by`, void/refund มี `approved_by` | Integration test      |

### B5. Usability & Accessibility

| ID         | Requirement                    | Target/Metric                             | Verification             |
| ---------- | ------------------------------ | ----------------------------------------- | ------------------------ |
| NFR-USE-01 | Contrast ratio หน้า POS        | ผ่าน WCAG AA                              | Accessibility audit tool |
| NFR-USE-02 | ปุ่มบน POS ต้อง touch-friendly | ขนาดอย่างน้อย 44×44px                     | UI review                |
| NFR-USE-03 | Cashier ใหม่ใช้ POS ได้เร็ว    | เรียนรู้ภายใน 15 นาทีโดยไม่ต้องอบรมทางการ | User testing ก่อน launch |

### B6. Maintainability & Code Quality

| ID           | Requirement                                 | Target/Metric                                                   | Verification  |
| ------------ | ------------------------------------------- | --------------------------------------------------------------- | ------------- |
| NFR-MAINT-01 | TypeScript strict mode                      | ห้าม `any` โดยไม่มีเหตุผลระบุเป็นคอมเมนต์                       | CI type-check |
| NFR-MAINT-02 | Business logic แยกจาก UI                    | อยู่ใน `services/` เท่านั้น เพื่อ unit test ได้โดยไม่ render UI | Code review   |
| NFR-MAINT-03 | Service function ที่กระทบเงิน/สต็อกมี JSDoc | ระบุ pre/post-condition ชัดเจนทุกฟังก์ชัน                       | Code review   |

### B7. Data Integrity & Auditability

| ID           | Requirement                               | Target/Metric                                                                               | Verification               |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| NFR-AUDIT-01 | ตาราง append-only ห้าม UPDATE/DELETE จริง | Enforce ระดับ DB (เช่น REVOKE privilege หรือ trigger) ไม่ใช่พึ่ง convention เพียงอย่างเดียว | Migration review (Checker) |
| NFR-AUDIT-02 | ตัวเลข Report ตรงกับ ledger 100%          | Reconciliation test ระหว่าง report กับ raw ledger                                           | E2E test (TESTING.md §3)   |

### B8. Observability

| ID         | Requirement                      | Target/Metric                              | Verification     |
| ---------- | -------------------------------- | ------------------------------------------ | ---------------- |
| NFR-OBS-01 | Error tracking ก่อนเข้า POS จริง | ติดตั้ง (เช่น Sentry) ก่อน Phase 8         | DEPLOYMENT.md §5 |
| NFR-OBS-02 | Log retention                    | ตาม plan ของ Vercel/Supabase ที่ใช้งานจริง | Config review    |

### B9. Localization & Compliance

| ID         | Requirement                  | Target/Metric                                          | Verification                 |
| ---------- | ---------------------------- | ------------------------------------------------------ | ---------------------------- |
| NFR-LOC-01 | ภาษาไทยเป็นหลัก              | Validation error ทุกจุด map เป็นข้อความไทยที่เข้าใจได้ | Manual QA                    |
| NFR-LOC-02 | สกุลเงิน/รูปแบบตัวเลข-วันที่ | THB + locale ไทย                                       | Manual QA                    |
| NFR-LOC-03 | ฟอนต์ไทยใน PDF ถูกต้อง       | 100% ไม่มีสระ/วรรณยุกต์เพี้ยน                          | Visual regression test (D10) |

### B10. Compatibility

| ID            | Requirement                       | Target/Metric                            | Verification       |
| ------------- | --------------------------------- | ---------------------------------------- | ------------------ |
| NFR-COMPAT-01 | POS ใช้งานได้ดีบนแท็บเล็ตหน้าร้าน | Responsive + touch-friendly ตาม UI_UX.md | Manual device test |

### B11. Legal & Regulatory Compliance (ประเทศไทย)

| ID          | Requirement                                                                          | Target/Metric                                    | Verification                 |
| ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------- |
| NFR-COMP-01 | PDPA — ฐานทางกฎหมายในการเก็บข้อมูลพนักงาน + Data Subject Rights ขั้นต่ำ              | ตาม `DECISIONS.md` D15                           | Legal review ก่อน production |
| NFR-COMP-02 | PDPA — Data Breach แจ้ง PDPC ภายใน 72 ชั่วโมง                                        | มีแผน incident response ที่ระบุผู้รับผิดชอบ      | DEPLOYMENT.md §5             |
| NFR-COMP-03 | ใบกำกับภาษีอย่างย่อครบตามมาตรา 86/6 ประมวลรัษฎากร (เมื่อ `is_vat_registered = true`) | 100% ของใบเสร็จที่ออกมีข้อมูลครบ                 | Manual QA + Legal review     |
| NFR-COMP-04 | Data Retention ≥ 5 ปี ตาม พ.ร.บ.การบัญชี พ.ศ. 2543 มาตรา 14                          | ไม่มี auto-purge job ใน ledger tables ภายใน 5 ปี | Migration/Ops review         |

> ทั้ง 4 ข้อนี้อ้างอิงกฎหมายไทยจริง แต่เป็นสรุปหลักการทั่วไปเพื่อวางแนวทางระบบเท่านั้น — ต้องให้ผู้เชี่ยวชาญกฎหมาย/บัญชีตรวจสอบก่อน production ตามที่ระบุใน `DECISIONS.md` D15-D17

---

## C. Traceability Summary

| Phase     | FR IDs                                 | NFR IDs ที่เกี่ยวข้องเป็นพิเศษ                     |
| --------- | -------------------------------------- | -------------------------------------------------- |
| 1         | FR-AUTH-*                              | NFR-SEC-03, NFR-COMP-01                            |
| 2         | FR-RBAC-_, FR-USR-_                    | NFR-SEC-01, NFR-COMP-01                            |
| 3         | FR-ING-*                               | NFR-SCALE-01                                       |
| 4         | FR-RCP-*                               | —                                                  |
| 5         | FR-MENU-*                              | —                                                  |
| 6         | FR-INV-*                               | NFR-AUDIT-01                                       |
| 7         | FR-PUR-*                               | —                                                  |
| 8         | FR-POS-*                               | NFR-PERF-02, NFR-SEC-05, NFR-AUDIT-01, NFR-COMP-03 |
| 9         | FR-EXP-*                               | NFR-AUDIT-01                                       |
| 10        | FR-DASH-*                              | NFR-PERF-01                                        |
| 11        | FR-RPT-*                               | NFR-PERF-03, NFR-PERF-04, NFR-LOC-03, NFR-AUDIT-02 |
| 12        | FR-SET-*                               | NFR-COMP-03                                        |
| 13        | — (UAT process, ดู `DECISIONS.md` D18) | —                                                  |
| 14        | —                                      | NFR-COMP-02, NFR-COMP-04                           |
| ทุก Phase | —                                      | NFR-MAINT-*, NFR-SEC-01/02/04, NFR-OBS-01          |

> **หมายเหตุ**: Phase 0 (Project Init), 13 (Testing — มีแต่ process ตาม D18, ไม่มี FR), 14 (Deployment — มีแต่ NFR ตาม
> คอลัมน์ขวา), และ 15 (Post-MVP Roadmap) ไม่มีแถวใน FR โดยตั้งใจ — เป็นงาน tooling/process/future-scope ไม่ใช่ feature
> ที่มี user-facing functional requirement โดยตรง

ทุกครั้งที่เพิ่ม FR/NFR ใหม่ ให้เพิ่มแถวในตารางนี้ด้วย เพื่อให้ตรวจสอบความครบถ้วนได้จากจุดเดียว
