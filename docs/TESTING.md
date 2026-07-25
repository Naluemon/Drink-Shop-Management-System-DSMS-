# TESTING.md — Drink Shop Management System (DSMS)

## 1. Stack

| ประเภท             | เครื่องมือ                                                            |
| ------------------ | --------------------------------------------------------------------- |
| Unit / Integration | Vitest + React Testing Library                                        |
| E2E                | Playwright                                                            |
| API/Service layer  | Vitest (mock Prisma client ด้วย `vitest-mock-extended` หรือเทียบเท่า) |

## 2. Reference Sample Dataset (ชุดข้อมูลอ้างอิงสำหรับ test/seed — ไม่ใช่ตัวแปรสมมุติ)

> ตัวเลขด้านล่างเป็น**ช่วงราคาต้นทุนวัตถุดิบที่สมจริงในตลาดร้านเครื่องดื่มไทย** (ระดับ wholesale/food-service ทั่วไป)
> ใช้แทนที่ placeholder แบบ "Ingredient A ราคา X" เพื่อให้ test case คำนวณได้จริงและ reproducible
> ร้านจริงต้องแทนที่ด้วยราคาซื้อจริงของตัวเองก่อน production — นี่คือชุดข้อมูลสำหรับ dev/test/seed เท่านั้น

### 2.1 Ingredients

| ชื่อ                | Purchase Unit | ราคาซื้อ                              | Base Unit | Conversion Factor | Cost/Base Unit  |
| ------------------- | ------------- | ------------------------------------- | --------- | ----------------- | --------------- |
| นมสด UHT            | กล่อง 946 ml  | 50.00 บาท (lot 1) / 55.00 บาท (lot 2) | ml        | 1 กล่อง = 946 ml  | ดู WAC ด้านล่าง |
| ผงชาไทย             | ถุง 200 g     | 95.00 บาท/ถุง                         | gram      | 1 ถุง = 200 g     | 0.4750 บาท/g    |
| น้ำเชื่อม           | ขวด 750 ml    | 40.00 บาท/ขวด                         | ml        | 1 ขวด = 750 ml    | 0.0533 บาท/ml   |
| ไข่มุก (ไทเปียก้า)  | ถุง 1,000 g   | 70.00 บาท/ถุง                         | gram      | 1 ถุง = 1,000 g   | 0.0700 บาท/g    |
| แก้ว+ฝา+หลอด (16oz) | แพ็ค 50 ชุด   | 90.00 บาท/แพ็ค                        | piece     | 1 แพ็ค = 50 ชุด   | 1.8000 บาท/ชุด  |

**ตัวอย่าง WAC (D1)**: นมสด UHT รับเข้า 2 ล็อต — ล็อต 1: 10 กล่อง × 50.00 = 500.00 บาท, ล็อต 2: 10 กล่อง × 55.00 = 550.00 บาท
→ WAC = (500.00 + 550.00) ÷ 20 = **52.50 บาท/กล่อง** → ต่อ ml = 52.50 ÷ 946 = **0.0555 บาท/ml** (ปัดทศนิยม 4 ตำแหน่ง)

### 2.2 Recipe: "ชาไทยเย็น" (Thai Iced Tea) — yield 1 แก้ว, Size M (default variant)

| Ingredient       | ปริมาณ | ต้นทุน                 |
| ---------------- | ------ | ---------------------- |
| ผงชาไทย          | 20 g   | 20 × 0.4750 = 9.50 บาท |
| นมสด UHT         | 60 ml  | 60 × 0.0555 = 3.33 บาท |
| น้ำเชื่อม        | 30 ml  | 30 × 0.0533 = 1.60 บาท |
| แก้ว+ฝา+หลอด     | 1 ชุด  | 1 × 1.80 = 1.80 บาท    |
| **รวม (Size M)** |        | **16.23 บาท**          |

### 2.3 Menu Variant & Modifier

| Entity                                                                                                 | ค่า                                                             |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Menu: ชาไทยเย็น (ราคาตั้งต้น Size M)                                                                   | 35.00 บาท (VAT-inclusive)                                       |
| Variant: Size S (`recipe_multiplier` = 0.8 บนสัดส่วนวัตถุดิบเครื่องดื่ม 14.43 บาท, แก้วคงที่ 1.80 บาท) | cost = (14.43×0.8)+1.80 = 13.34 บาท, `price_delta` = -5.00 บาท  |
| Variant: Size L (`recipe_multiplier` = 1.3)                                                            | cost = (14.43×1.3)+1.80 = 20.56 บาท, `price_delta` = +10.00 บาท |
| Modifier: ไข่มุก (ผูก ingredient, quantity 30g)                                                        | cost เพิ่ม = 30×0.07 = 2.10 บาท, `price_delta` = +10.00 บาท     |

## 3. Concrete Test Cases (คำนวณจากชุดข้อมูล §2 — ใช้แทน placeholder ในการเขียน unit/integration test จริง)

| Test ID      | Given                                                                        | When                                                | Then                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-WAC-01    | นมสด UHT รับเข้า 2 ล็อต (10@50.00, 10@55.00)                                 | ระบบบันทึก stock_in ทั้ง 2 ล็อตตามลำดับ             | `cost_per_unit` ต่อกล่อง = 52.50 บาท, ต่อ ml = 0.0555 บาท (D1)                                                                                       |
| TC-UNIT-01   | ผงชาไทย purchase_unit = ถุง 200g ราคา 95.00 บาท                              | บันทึก ingredient + unit_conversion                 | `cost_per_unit` ต่อกรัม = 0.4750 บาท (D2)                                                                                                            |
| TC-COST-01   | Recipe "ชาไทยเย็น" ตาม §2.2                                                  | คำนวณ recipe cost                                   | ได้ 16.23 บาท ±0.01 (cost cascade, ARCHITECTURE.md §3)                                                                                               |
| TC-COST-02   | ต้นทุนผงชาไทยเปลี่ยนจาก 0.4750 → 0.5000 บาท/g (ราคาขึ้น)                     | ระบบ recalculate อัตโนมัติ                          | Recipe cost เปลี่ยนจาก 16.23 → 16.73 บาททันที โดยไม่ต้อง manual trigger                                                                              |
| TC-VAR-01    | Variant Size L ตาม §2.3                                                      | ลูกค้าสั่ง Size L                                   | cost snapshot = 20.56 บาท, ราคาขาย = 45.00 บาท (35+10)                                                                                               |
| TC-MOD-01    | Modifier ไข่มุกตาม §2.3, สั่ง Size M + ไข่มุก                                | ยืนยันการขาย                                        | cost snapshot รวม = 16.23+2.10 = 18.33 บาท, ราคาขาย = 45.00 บาท (35+10), สต็อกไข่มุกลด 30g                                                           |
| TC-RND-01    | ขาย 2 แก้ว Size M ราคารวม 70.00 บาท, ส่วนลดบิล 5% (3.50 บาท)                 | คำนวณยอดสุทธิ                                       | ยอดก่อนปัดเศษ = 66.50 บาท → ปัดขึ้น (round-half-up ตาม D9) = **67.00 บาท**, `rounding_adjustment` = +0.50                                            |
| TC-DEF-01    | สต็อกไข่มุกเหลือ 20g (ต้องใช้ 30g)                                           | Cashier ขาย Size M + ไข่มุก                         | ระบบแสดง warning แต่ขายต่อได้, `inventory_movements.is_stock_deficit = true`, สต็อกไข่มุกเหลือ -10g (D4)                                             |
| TC-VOID-01   | ธุรกรรมยอด 45.00 บาท (Size M+ไข่มุก) ในกะเดียวกัน                            | Cashier กด Void พร้อมเหตุผล "ลูกค้าเปลี่ยนใจ"       | สร้าง reversal entry, คืนสต็อกทุก ingredient ที่ตัดไป (ผงชาไทย 20g, นม 60ml, น้ำเชื่อม 30ml, แก้ว 1 ชุด, ไข่มุก 30g), ยอดขายวันนั้นลด 45.00 บาท (D5) |
| TC-REFUND-01 | `refund_approval_threshold` = 500.00 บาท, คำขอ refund ยอด 45.00 บาท          | Shift Supervisor กด Approve                         | สร้าง reversal สำเร็จทันทีโดยไม่ต้องรอ Manager/Owner (D5, D14)                                                                                       |
| TC-REFUND-02 | `refund_approval_threshold` = 500.00 บาท, คำขอ refund ยอด 800.00 บาท         | Shift Supervisor พยายาม Approve                     | ถูกปฏิเสธด้วย `FORBIDDEN` — ต้องส่งต่อ Manager/Owner เท่านั้น (D14)                                                                                  |
| TC-RBAC-01   | ผู้ใช้ role Accountant                                                       | พยายามเข้าหน้า POS หรือ Inventory                   | ถูกปฏิเสธด้วย `FORBIDDEN` (D14)                                                                                                                      |
| TC-RBAC-02   | ผู้ใช้ role Employee                                                         | พยายามเรียก adjustment แบบอิสระ (ไม่มี reason code) | ถูกปฏิเสธด้วย `FORBIDDEN` (D12)                                                                                                                      |
| TC-BIZDAY-01 | `business_day_start_hour` = 05:00, ธุรกรรมเวลา 01:30 น. ของวันที่ 2026-07-25 | ดู Dashboard/Report                                 | ธุรกรรมนับรวมในวันที่ 2026-07-24 ไม่ใช่ 2026-07-25 (D8)                                                                                              |

## 4. Coverage Guideline

- `services/` (business logic, cost cascade, stock deduction): **ต้อง** มี unit test ครอบคลุม edge case หลัก (เช่น stock ไม่พอ, ต้นทุนเป็น 0, quantity ติดลบ, WAC recalculation หลังรับของหลายล็อต — ดู §3 TC-WAC-01)
- `actions/`: integration test ที่รวมการตรวจสิทธิ์ + validation
- ไม่บังคับ coverage % ตายตัว แต่ทุก Non-Negotiable Design Principle ใน `AGENTS.md` §4 ต้องมี test ยืนยันเสมอ
- **ทุก Decision ใน `DECISIONS.md` ต้องมี test ยืนยันอย่างน้อย 1 เคส** ก่อนถือว่า Phase ที่เกี่ยวข้องเสร็จ — ดู §3 สำหรับตัวอย่างที่คำนวณจริงของ D1, D2, D3, D4, D5, D9, D12, D14 ส่วน D6, D8 ดูรายละเอียดเพิ่มด้านล่าง:
  - D6 (Bootstrap/Invite): user คนแรก signup → ได้ role Owner, signup คนที่สองโดยไม่มี invite → ถูกปฏิเสธ
  - D15 (PDPA): ผู้ใช้เรียกดู/แก้ไขข้อมูลตนเองได้, ปิดการใช้งานบัญชีแล้ว login ไม่ได้ทันที
  - D16 (Tax Invoice): เมื่อ `is_vat_registered=true`, ใบเสร็จมี `tax_id`+เลขที่ใบกำกับภาษีต่อเนื่อง; void ไม่กินเลขที่

## 5. E2E Scenario ขั้นต่ำ (Playwright)

- Login → เข้าไม่ถึงหน้าที่ไม่มีสิทธิ์ (ทดสอบครบทั้ง 6 role: Owner, Manager, Shift Supervisor, Cashier, Employee, Accountant)
- Signup คนแรก → ได้ Owner, Invite พนักงานใหม่แต่ละ role → login ผ่านลิงก์เชิญสำเร็จ
- สร้าง ingredient (พร้อม unit conversion ตาม §2.1) → สร้าง recipe (§2.2) → สร้าง menu พร้อม variant/modifier (§2.3) → cost คำนวณถูกต้องตลอด chain
- ขายผ่าน POS (เลือก variant + modifier ตาม §3) → สต็อกลดตามจริง → dashboard ตัวเลขอัปเดต
- Void รายการในกะเดียวกัน (TC-VOID-01) → สต็อกคืน, ยอดขายลด
- Request refund ข้ามกะ → Shift Supervisor approve (ยอดต่ำกว่า threshold) และ Manager approve (ยอดสูงกว่า threshold) → reversal เกิดขึ้นพร้อม audit trail ครบ
- Accountant login → เห็นเฉพาะ Expense/Reports การเงิน → เข้า POS/Inventory ไม่ได้

## 6. Test Data Management

- Seed script (dev/staging) ใช้ Reference Sample Dataset ใน §2 เป็นค่าเริ่มต้นเสมอ เพื่อให้ทุกคนในทีมรัน test แล้วได้ผลลัพธ์ตรงกัน (reproducible)
- **ห้ามใช้ข้อมูล production จริงใน environment ที่ต่ำกว่า production เด็ดขาด** (Local/Preview) — ถ้าจำเป็นต้อง debug ด้วยข้อมูลจริง ต้อง anonymize ข้อมูลส่วนบุคคลของพนักงานก่อน (ชื่อ, อีเมล) ตามหลัก PDPA (ดู `DECISIONS.md` D15, `SECURITY.md` §7)
- Reset ฐานข้อมูล test ให้กลับสู่ baseline (§2) ก่อนรัน E2E suite ทุกครั้ง ไม่ให้ test ก่อนหน้ากระทบ test ถัดไป

## 7. Regression Testing Policy

- การเปลี่ยนแปลงใด ๆ ที่กระทบ **Cost Cascade, POS checkout, หรือ RBAC matrix** ต้องรัน E2E suite เต็มก่อน merge เสมอ (ไม่ใช่แค่ test ของ feature ที่แก้) เพราะ 3 จุดนี้เป็นจุดที่ error กระทบเงินโดยตรงและ regression ตรวจจับยากด้วย unit test อย่างเดียว
- ทุก bug ที่เจอใน production ต้องเพิ่มเป็น regression test case ก่อนปิด issue (ห้าม fix แล้วปิดโดยไม่มี test กันไม่ให้เกิดซ้ำ)

## 8. User Acceptance Testing — UAT (ดู `DECISIONS.md` D18)

ก่อน sign-off ไป production (ท้าย Phase 13) ต้องมี UAT รอบจริงโดย:

- **Owner** (หรือตัวแทน) ทดสอบ Dashboard/Reports ว่าตัวเลขตรงกับที่คาดหวังจริง
- **อย่างน้อย 1 Cashier ตัวจริง** ทดสอบ POS ทั้ง flow (ขาย → เลือก variant/modifier → ชำระเงิน → void) ว่าใช้งานเร็วพอสำหรับหน้าร้านจริง
- **Shift Supervisor** (ถ้ามีในองค์กร) ทดสอบ approve refund
- Sign-off ต้องบันทึกเป็นลายลักษณ์อักษร (checklist ผ่าน/ไม่ผ่านต่อ scenario) ก่อนถือว่า Phase 13 เสร็จจริง — automated test ผ่านอย่างเดียวไม่พอ

## 9. Definition of Done เชื่อมกับ Testing

Feature จะ merge เข้า `main` ได้ต้องผ่าน:

- Unit + Integration test ผ่านใน CI
- อย่างน้อย 1 E2E scenario ต่อ Phase ที่ critical (POS, Auth, RBAC)
- Type-check ผ่านแบบ strict

## 10. Performance Test

- Dashboard (Phase 10): ทดสอบ load time ต้อง < 2 วินาทีภายใต้ข้อมูลจำลองระดับ production (เช่น 1 ปีของธุรกรรม สร้างจากการวนซ้ำ §2 Reference Dataset)

## 11. Security Test (Phase 13)

- ทดสอบว่า RBAC matrix ใน `SECURITY.md` §1 ตรงกับพฤติกรรมจริงทุก role (6 role) × ทุก module (เขียนเป็น test matrix อัตโนมัติ — ดู TC-RBAC-01/02 ใน §3 เป็นตัวอย่าง, `lib/permissions.matrix.test.ts`)
- ~~ทดสอบว่า RLS policy ไม่ปล่อยให้ query ข้าม branch_id ได้~~ — **D7 (ยืนยันแล้ว, Phase 13)**: ไม่มี RLS policy จริงใน MVP เพราะ Prisma
  connection สิทธิ์สูงทำให้ RLS ไม่มีผลกับ request ปกติเลย (ดู `DECISIONS.md` D7) — RBAC matrix test ด้านบนคือด่านป้องกันจริงที่ต้องทดสอบแทน
- ทดสอบสิทธิ PDPA (D15): ผู้ใช้เข้าถึงข้อมูลส่วนตัวคนอื่นไม่ได้ นอกจาก Owner ที่มีสิทธิ์บริหารจัดการ
