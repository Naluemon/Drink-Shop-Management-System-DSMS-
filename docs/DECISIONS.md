# DECISIONS.md — Drink Shop Management System (DSMS)

> **Purpose**: แหล่งความจริงเดียว (single source of truth) สำหรับการตัดสินใจเชิงสถาปัตยกรรม/ธุรกิจที่เคย
> เป็นช่องว่างระหว่างเอกสาร (gap) มาก่อน เพื่อไม่ให้เกิดการแก้ไขแบบวนลูปภายหลัง — ทุกครั้งที่มีคำถามซ้ำ
> ("ทำไมเราตัดสินใจแบบนี้") ให้กลับมาอ่านที่นี่ก่อนเปิดประเด็นใหม่
>
> **สถานะ**: เอกสารนี้เป็น "Assumption ที่บันทึกไว้" ตามหลัก Soft-Stop ใน `AGENTS.md` §2 — ใช้ค่า
> มาตรฐานอุตสาหกรรม F&B/ร้านเครื่องดื่มจริงเป็นฐาน ผู้ใช้ตรวจสอบและแก้ไขได้ทุกข้อก่อนเริ่ม Phase ที่เกี่ยวข้อง
> ห้ามเปลี่ยนข้อใดในนี้ระหว่าง implement โดยไม่อัปเดตไฟล์นี้พร้อมกัน (ตาม `AGENTS.md` §3 ข้อ 6)
>
> **⚠️ ข้อยกเว้นที่ต้องระบุตรง ๆ (พบโดย Checker)**: D6, D7, D12, D13, D14 กระทบ Authorization/Security โดยตรง
> ซึ่งตามเกณฑ์ Hard-Stop ใน `AGENTS.md` §2 ควรถามผู้ใช้ก่อนเสมอ ไม่ใช่ตัดสินใจแทนแบบ Soft-Stop — เอกสารนี้บันทึกไว้
> เป็น "ข้อเสนอที่วิเคราะห์แล้วรอการยืนยัน" ไม่ใช่ข้อสรุปสุดท้าย **ห้าม Maker ถือว่า 5 ข้อนี้ finalized จนกว่าผู้ใช้จะยืนยันจริง**
> แม้จะสมเหตุสมผลตามมาตรฐานอุตสาหกรรมก็ตาม ส่วน D15-D18 เป็นข้อกำหนดทางกฎหมาย/กระบวนการที่อ้างอิงกฎหมายจริง
> ไม่ใช่ทางเลือกเชิงนโยบาย จึงไม่เข้าเกณฑ์ Hard-Stop เดียวกัน แต่ยังคงต้องให้ผู้เชี่ยวชาญกฎหมาย/บัญชีตรวจสอบซ้ำก่อน production
>
> **อัปเดต (Phase 13)**: **D7 ได้รับการยืนยันจากผู้ใช้แล้ว** — เลือก "ยืนยันว่า RBAC ใน application code คือด่านป้องกันจริงเพียงด่านเดียว
> ไม่ทำ RLS policy สำหรับ MVP" (ไม่ใช่ตัวเลือก "สร้าง RLS policy จริงเป็น defense-in-depth") ดูรายละเอียดที่ D7 ด้านล่าง
> D6, D12, D13, D14 ยังคงสถานะเดิม (implemented และใช้งานต่อเนื่องมาแล้วหลาย Phase โดยไม่มีข้อทักท้วง แต่ยังไม่มีการถามยืนยันตรง ๆ)

รูปแบบแต่ละ decision: **Decision** (สิ่งที่ตัดสินใจ) / **Rationale** (เหตุผล) / **Impact** (กระทบเอกสาร/Phase ไหน) / **Review Trigger** (เมื่อไหร่ควรกลับมาทบทวน)

---

## D1 — วิธีคิดต้นทุนวัตถุดิบ (Ingredient Costing Method)

**Decision**: ใช้ **Weighted Average Cost (WAC)** ไม่ใช่ Latest Purchase Price

- `ingredients.cost_per_unit` = ต้นทุนเฉลี่ยถ่วงน้ำหนักจากทุกครั้งที่รับของเข้า (purchase receipt)
- สูตร: `new_avg = ((old_qty * old_avg) + (received_qty * received_price)) / (old_qty + received_qty)`
- ก่อนมี purchase order ครั้งแรก (Phase 3 ยังไม่ถึง Phase 7): อนุญาตให้กรอก `cost_per_unit` มือได้ (bootstrap value) — เมื่อ Phase 7 เริ่มมี PO จริง ค่านี้จะถูกแทนที่ด้วย WAC ที่คำนวณจาก PO แรกทันที

**Rationale**: Latest price ผันผวนตามราคาตลาดรายวัน ทำให้ recipe cost กระโดดทุกครั้งที่ซื้อของ ทั้งที่สต็อกเก่ายังขายไม่หมด WAC สะท้อนต้นทุนจริงของสต็อกที่ถืออยู่ และเป็นมาตรฐานบัญชีสต็อกที่ตรวจสอบได้ (auditable) มากกว่า

**Impact**: `DATABASE.md` §6, `ARCHITECTURE.md` §3 (Cost Cascade), Phase 3 & Phase 7 ใน `IMPLEMENTATION_PLAN.md`

**Review Trigger**: ถ้าร้านต้องการเปลี่ยนเป็น FIFO/Latest ในอนาคต (เช่นวัตถุดิบราคาผันผวนสูงมาก) ต้องออกแบบ migration path ของ cost cascade ใหม่ทั้งหมด — ไม่ใช่แค่เปลี่ยนสูตร

---

## D2 — หน่วยวัดและการแปลงหน่วย (Unit of Measure & Conversion)

**Decision**: แยก 3 concept ชัดเจน

1. `base_unit` — หน่วยที่ใช้ในสูตร (recipe) เสมอ: `gram`, `ml`, `piece` เท่านั้น (3 ค่าคงที่ ไม่ขยาย)
2. `purchase_unit` — หน่วยที่ซื้อจริงจาก supplier (เช่น "กล่อง", "ลัง", "ขวด 946ml", "ถุง 1kg")
3. `unit_conversions` — ตารางแปลง `purchase_unit → base_unit` ต่อ ingredient (เช่น 1 กล่องนม = 946 ml)

`ingredients.cost_per_unit` เก็บเป็นราคาต่อ `base_unit` เสมอ (คำนวณจาก purchase price ÷ conversion factor) ส่วน purchase order ใช้ `purchase_unit` ในการกรอก/แสดงผล

**Rationale**: Phase 3 AC ("คำนวณ Price/Gram และ Price/ML อัตโนมัติ") ทำไม่ได้เลยถ้าไม่มี conversion factor เพราะร้านซื้อวัตถุดิบเป็นกล่อง/ลัง/ขวด ไม่ใช่กรัม/มล.

**Impact**: `DATABASE.md` (ตารางใหม่ `unit_conversions`, คอลัมน์ `ingredients.base_unit`, `ingredients.purchase_unit`), Phase 3 & Phase 7

**Review Trigger**: ถ้ามี ingredient ที่ซื้อได้หลาย purchase_unit พร้อมกัน (เช่น ซื้อทั้งกล่องและลัง) ต้องขยายเป็น 1-to-many — ออกแบบไว้ล่วงหน้าให้ `unit_conversions` เป็นตารางแยกไม่ผูกเป็นคอลัมน์เดียวใน ingredients เพื่อรองรับกรณีนี้ได้โดยไม่ breaking change

---

## D3 — โครงสร้างตัวเลือกเมนู (Menu Variants, Modifiers, Toppings)

**Decision**: เพิ่ม 2 entity ใหม่ ไม่ผูกกับ `menus` ตรง ๆ

1. **`menu_variants`** — ตัวเลือกที่เปลี่ยน "สูตร/ปริมาณ" (เช่น Size S/M/L) → แต่ละ variant มี `recipe_id` ของตัวเอง หรือ multiplier ต่อ recipe หลัก (เลือกแบบ multiplier เป็น default เพื่อลดการซ้ำสูตร) และมี `price_delta` (ส่วนต่างราคา)
2. **`modifier_groups`** + **`modifiers`** — ตัวเลือกเสริม (topping, ระดับความหวาน, ระดับน้ำแข็ง) แต่ละ modifier ผูกกับ `ingredient_id` + `quantity` (ถ้ากินสต็อก เช่น ไข่มุก) หรือไม่ผูกเลย (ถ้าเป็นแค่ระดับความหวานที่ไม่ใช้วัตถุดิบเพิ่ม) และมี `price_delta` ของตัวเอง

Cost ต่อรายการขาย = `recipe_cost * variant_multiplier + Σ(modifier.ingredient_cost)` คำนวณ ณ เวลาขายแล้ว snapshot ทันที (ตาม D-ledger, ดู AGENTS.md §4)

**Rationale**: นี่คือช่องว่างใหญ่ที่สุดที่พบ — ร้านเครื่องดื่มแทบทุกร้านขาย size/topping/ความหวานแยกราคา ถ้าไม่มี schema รองรับตั้งแต่ Phase 4-5 จะต้องรื้อ recipe/menu schema ทั้งหมดตอน Phase 8 (POS)

**Impact**: `DATABASE.md` (ตารางใหม่ `menu_variants`, `modifier_groups`, `modifiers`, `sales_transaction_item_modifiers`), `ARCHITECTURE.md` §3, Phase 4/5/8, `UI_UX.md` (POS screen ต้องมี variant/modifier selector)

**Review Trigger**: ถ้ามี modifier ที่กระทบสต็อกวัตถุดิบมากกว่า 1 ตัวพร้อมกัน (เช่น topping รวม) ให้ตรวจสอบว่า stock deduction ครอบคลุมทุก modifier ที่เลือกจริง ไม่ใช่แค่ recipe หลัก

---

## D4 — นโยบายเมื่อสต็อกไม่พอ (Insufficient Stock at POS)

**Decision**: **อนุญาตให้ขายต่อได้ (non-blocking) พร้อมเตือน** เป็นค่าเริ่มต้น ไม่บล็อกการขายทันที

- ระบบแสดง warning banner ที่ POS แต่ Cashier ยังกดขายต่อได้ (สต็อกติดลบได้ชั่วคราว)
- ทุกรายการที่ขายตอนสต็อกไม่พอ ต้องถูก flag (`inventory_movements.is_stock_deficit = true`) เพื่อให้ Manager/Owner เห็นใน Report ว่าเกิดขึ้นบ่อยแค่ไหน (สัญญาณว่าการนับสต็อกคลาดเคลื่อน)
- Owner ปรับเป็นโหมด "บล็อกเข้มงวด" ได้ใน Settings ต่อ ingredient หรือ global (เผื่อร้านที่ต้องการควบคุมเข้ม)

**Rationale**: ร้านเครื่องดื่มจริงเจอสต็อกนับคลาดเคลื่อนบ่อยมาก (เช่น น้ำแข็งละลาย, ของเสีย) การบล็อกการขายเพราะระบบนับผิดพลาด = เสียโอกาสขายจริง ทำร้ายธุรกิจมากกว่าการปล่อยให้สต็อกติดลบชั่วคราวแล้วไปกระทบยอด adjustment ทีหลัง

**Impact**: `DATABASE.md` (คอลัมน์ `is_stock_deficit`), `API.md` §6 (เพิ่ม error code ใหม่ `STOCK_DEFICIT_WARNING` แยกจาก `CONFLICT` เดิม — `CONFLICT` ยังคงหมายถึงกรณีบล็อกจริงตามปกติ ไม่ได้ถูกเปลี่ยนความหมาย), Phase 6 & Phase 8, `SECURITY.md` §1 (Settings permission สำหรับเปลี่ยนโหมดนี้)

**Review Trigger**: ถ้า Owner ร้องขอโหมดบล็อกเข้มงวดเป็น default หลัง MVP ให้ทบทวนพร้อม UX การแจ้งเตือนที่ชัดเจนขึ้น

---

## D5 — Refund / Void การขาย

**Decision**: มี 2 เส้นทางแยกตามเวลา

1. **Void ภายในกะเดียวกัน (same-shift, ก่อน settlement)**: Cashier ยกเลิกได้เอง แต่ต้องระบุเหตุผล (reason code บังคับ) — สร้าง reversal entry ทันที คืนสต็อกอัตโนมัติ
2. **Refund หลังปิดกะ/ข้ามวัน**: ต้องผ่าน Manager หรือ Owner เท่านั้น (Cashier "ขอ" ได้แต่กดยืนยันเองไม่ได้) — สร้าง reversal entry + บันทึกผู้อนุมัติ
3. **ปรับปรุงตาม D14**: Shift Supervisor อนุมัติ refund ได้เองถ้ายอดไม่เกิน `refund_approval_threshold` ที่ตั้งไว้ (Settings, default 500 บาท) เพื่อไม่ให้ธุรกรรมค้างตอน Manager/Owner ไม่อยู่หน้าร้าน — เกิน threshold ต้องส่งต่อ Manager/Owner เท่านั้น

ทั้งสองกรณีเป็น **reversal entry ใหม่** ที่อ้างอิง `original_transaction_id` (ตาม Immutable Ledger, ห้าม UPDATE/DELETE ของเดิม) สต็อกที่ตัดไปคืนกลับผ่าน `inventory_movements` ประเภท `reversal` ใหม่เช่นกัน

**Rationale**: ร้านจริงเกิด "กดผิด" และ "ลูกค้าคืนของ" ทุกวัน ถ้าไม่มีเส้นทางนี้ตั้งแต่ Phase 8 ระบบจะใช้งานจริงไม่ได้ทันทีที่ deploy และ append-only ledger ทำให้แก้ทีหลังยากกว่าระบบทั่วไปมาก (ต้องคิด reversal model ตั้งแต่ต้น)

**Impact**: `SECURITY.md` (เพิ่มแถว RBAC "Void/Refund"), `DATABASE.md` (`sales_transactions.reversal_of_id`, `sales_transactions.void_reason`, `approved_by`), Phase 8, `UI_UX.md` (ปุ่ม void ใน POS + หน้าจอ approve สำหรับ Manager)

**Review Trigger**: ถ้าต้องรองรับ partial refund (คืนบางรายการในบิล ไม่ใช่ทั้งบิล) ให้ออกแบบ reversal ระดับ item ไม่ใช่ระดับ transaction — ควรเผื่อ schema ไว้ตั้งแต่ตอนนี้ (ดู D-Note ท้ายไฟล์)

---

## D6 — การ Bootstrap ผู้ใช้แรกและการเชิญพนักงาน (User Bootstrap & Invite)

**Decision**:

- **ผู้ใช้คนแรกที่ signup สำเร็จในระบบ (เมื่อยังไม่มี Owner เลย) จะได้ role `Owner` โดยอัตโนมัติ** — เป็นเงื่อนไขครั้งเดียว (once-only bootstrap)
- หลังจากนั้น ผู้ใช้ใหม่ทุกคนต้องถูก **invite โดย Owner/Manager เท่านั้น** (ไม่มี public signup แบบเปิด) — invite กำหนด role ตอนเชิญ, ผู้ถูกเชิญตั้งรหัสผ่านเองผ่านลิงก์ที่ส่งอีเมล
- Google OAuth login ครั้งแรก (ถ้ายังไม่มี invite record ผูกอีเมลนั้นไว้) → **ปฏิเสธการเข้าระบบ** ไม่ auto-create user ใหม่ (ป้องกันคนนอกสมัครเข้าระบบเอง) ยกเว้นกรณี bootstrap owner คนแรก

**Rationale**: SECURITY.md ระบุ Auth = Email/Password + Google OAuth ไว้แล้ว แต่ไม่เคยตอบว่า "ใครเป็น Owner คนแรก" และ "ใครสมัครได้" — เป็นช่องโหว่ที่จะติดปัญหาจริงตอน deploy

**Impact**: `SECURITY.md` §1-2, `DATABASE.md` (ตาราง `user_invites`), Phase 1 & Phase 2 (เพิ่ม task Bootstrap + Invite flow)

**Review Trigger**: ถ้าต้องการเปิด public signup ในอนาคต (เช่น self-service multi-tenant) ต้องออกแบบ tenant isolation ใหม่ทั้งหมด — ปัจจุบันสมมติว่าเป็น single-tenant (ร้านเดียวเป็นเจ้าของระบบทั้งชุด)

---

## D7 — ความสัมพันธ์ Prisma Migration กับ RLS Policy (Schema Ownership)

**✅ ยืนยันแล้วโดยผู้ใช้ (Phase 13)**: เลือก "ยืนยันว่า RBAC ใน application code (lib/permissions.ts + requirePermission() ทุก
Server Action) คือด่านป้องกันจริงเพียงด่านเดียวสำหรับ request ปกติ — ไม่สร้าง RLS policy จริงสำหรับ MVP" เพราะ Prisma
เชื่อมต่อด้วย connection สิทธิ์สูงที่ RLS จะไม่มีผลกับ query ปกติของแอปเลยตามที่อธิบายไว้ด้านล่าง การสร้าง RLS policy ตอนนี้
จะเป็นแค่ security theater ไม่ได้ป้องกันอะไรจริงในเส้นทาง request ปกติ — Phase 13's security test (`TESTING.md` §11.2, RLS)
จึงถูกปรับเป็น "ยืนยัน RBAC matrix ตรงกับพฤติกรรมจริงทุก role" แทน ไม่ใช่ทดสอบ RLS ที่ไม่มีอยู่จริง ถ้าอนาคตต้องการให้ RLS
เป็นด่านจริง (ดู Review Trigger) ค่อยกลับมาสร้างตอนนั้น

**Decision**:

- **Prisma schema.prisma + `prisma migrate`** เป็น source of truth สำหรับโครงสร้างตาราง/คอลัมน์/index ทั้งหมด
- **RLS policy เป็นไฟล์ SQL แยกต่างหาก** เก็บใน `prisma/migrations/<timestamp>_rls_policies/migration.sql` (ใช้ Prisma migration ห่อ raw SQL ได้ ผ่าน `prisma migrate dev --create-only` แล้วเขียน SQL เอง) เพื่อให้ versioning อยู่ใน repo เดียวกับ schema change และ apply พร้อมกันเสมอ — **ห้ามแก้ RLS ผ่าน Supabase Dashboard ตรง ๆ โดยไม่ sync กลับเข้า migration file**
- **ชี้แจงบทบาทของ RLS ให้ชัดเจน (แก้ความเข้าใจผิดจากเอกสารเดิม)**: เนื่องจาก application เชื่อมต่อ Postgres ผ่าน Prisma ด้วย connection ที่มีสิทธิ์สูง (ไม่ผ่าน Supabase JWT), RLS **จะไม่ทำงานกับ query จาก path ปกติของแอปเลย** มันเป็นด่านป้องกันสำหรับ "การเข้าถึง DB นอกเส้นทางแอป" เท่านั้น (เช่น someone เข้า Supabase Dashboard ตรง, หรือ credential รั่ว) ไม่ใช่ "ด่านที่สองของทุก request" ตามที่ ARCHITECTURE.md เดิมสื่อความไว้

**Rationale**: ป้องกันปัญหาคลาสสิกของทีม Prisma+Supabase ที่ schema กับ RLS หลุด sync กัน และป้องกันความเข้าใจผิดว่า RLS ช่วยกัน bug ใน application layer ได้ (มันกันไม่ได้ถ้า connection เดียวกันมีสิทธิ์เต็ม)

**Impact**: `ARCHITECTURE.md` §2 (แก้ถ้อยคำ), `DEPLOYMENT.md` (CI ต้อง apply migration รวม RLS), `SECURITY.md` §3

**Review Trigger**: ถ้าในอนาคตต้องการให้ RLS เป็นด่านจริงของ request ปกติ ต้องเปลี่ยนสถาปัตยกรรมการเชื่อมต่อ DB ทั้งหมด (เช่นใช้ Supabase client แทน Prisma โดยตรง หรือทำ per-request role switching) — เป็นการเปลี่ยนสถาปัตยกรรมใหญ่ ไม่ใช่แค่เพิ่ม policy

---

## D8 — Timezone และขอบเขต "วันทางธุรกิจ" (Business Day Boundary)

**Decision**:

- เก็บ timestamp ทุกตารางเป็น **UTC** เสมอ (มาตรฐาน)
- เพิ่ม setting `company_settings.timezone` (default `Asia/Bangkok`) และ `company_settings.business_day_start_hour` (default `05:00`) — "วัน" ทางธุรกิจเริ่มที่ชั่วโมงนี้ตามเวลาท้องถิ่น ไม่ใช่เที่ยงคืน (เผื่อร้านเปิดยันดึก/ตี 1)
- Dashboard/Reports ทุกจุดที่ group by "วัน" ต้องใช้ business day boundary นี้เสมอ ไม่ใช่ calendar day ธรรมดา

**Rationale**: ร้านที่เปิดถึงดึก ยอดขายตี 1 ควรนับเป็น "เมื่อวาน" ไม่ใช่ "วันนี้" ถ้าไม่ fix ตั้งแต่ต้น ตัวเลข Dashboard/Report จะเถียงกับความเข้าใจของเจ้าของร้าน และแก้ยากเพราะ ledger เป็น append-only (ต้อง recalculate ทุกรายงานย้อนหลังถ้าเปลี่ยนกฎทีหลัง)

**Impact**: `DATABASE.md` (`company_settings` เพิ่มคอลัมน์), Phase 10 (Dashboard), Phase 11 (Reports), Phase 12 (Settings)

**Review Trigger**: Multi-branch phase ในอนาคต — แต่ละสาขาอาจมี business_day_start_hour ต่างกัน ต้องย้าย setting นี้จาก company-level ไป branch-level

---

## D9 — VAT, Discount, และการปัดเศษ (Rounding)

**Decision**:

- **ราคาที่แสดง = VAT-inclusive by default** (มาตรฐานร้านค้าปลีกไทย) — `tax_settings.vat_mode` เลือกได้ `inclusive`/`exclusive`/`none` แต่ default `inclusive`, `tax_settings.vat_rate` default 7%
- **Discount**: รองรับทั้งระดับ "รายการ" (`sales_transaction_items.discount_amount`) และ "ทั้งบิล" (`sales_transactions.discount_amount`) เก็บเป็นจำนวนเงินเสมอ (ถ้า UI รับเป็น % ให้แปลงเป็นจำนวนเงินก่อน snapshot) — Discount ลดเฉพาะ**รายได้** ไม่กระทบ `cost_at_sale_time` (ต้นทุนคงเดิม กำไรจึงลดลงตามส่วนลดจริง ไม่ถูกซ่อนในราคา)
- **Rounding**: ปัดเศษยอดรวมสุทธิ (grand total) เป็นหน่วยบาทถ้วน (ไม่มีสตางค์หมุนเวียนจริงในธุรกรรมเงินสด) โดยใช้ **round-half-up** (0.50 บาทขึ้นไปปัดขึ้น ต่ำกว่า 0.50 ปัดลง — ธรรมเนียมร้านค้าปลีกไทยทั่วไป) ผลต่างจากการปัดเศษบันทึกเป็น `sales_transactions.rounding_adjustment` แยกฟิลด์ (ไม่ผสมกับราคาเมนู) เพื่อให้ traceable ตาม Phase 11 AC

**Rationale**: ทั้ง 3 เรื่องนี้กระทบการคำนวณกำไรโดยตรงและเป็นสิ่งที่ร้านค้าจริงต้องมีตั้งแต่วันแรก การไม่ตัดสินใจไว้ก่อนจะทำให้ POS (Phase 8) ต้องหยุดพัฒนากลางคันเพื่อรอคำตอบ

**Impact**: `DATABASE.md` (คอลัมน์ discount/rounding), Phase 8 & Phase 9 & Phase 11

**Review Trigger**: ถ้าร้านลงทะเบียนภาษีมูลค่าเพิ่มเปลี่ยนสถานะ (เข้า/ออกระบบ VAT) ระหว่างทาง ให้ตรวจว่า historical transactions ไม่ถูก recalculate ย้อนหลัง (คงค่า vat_mode ณ เวลาขายไว้ใน snapshot ด้วย)

---

## D10 — PDF Export และฟอนต์ไทย

**Decision**: ใช้ **server-side rendering ด้วย Puppeteer/Playwright (headless Chromium)** แปลง HTML+CSS → PDF แทน library สร้าง PDF โดยตรง (เช่น pdf-lib, react-pdf)

**Rationale**: การ render ฟอนต์ไทยใน PDF library แบบ programmatic (react-pdf ฯลฯ) มักมีปัญหาการเรียงพยัญชนะ/สระ/วรรณยุกต์ผิดตำแหน่ง เพราะไม่รองรับ complex text shaping ของภาษาไทยได้ดีเท่า browser rendering engine จริง headless Chromium ใช้ font rendering engine เดียวกับที่ผู้ใช้เห็นบนเว็บ จึงรับประกันว่าใบเสร็จ/รายงานจะแสดงภาษาไทยถูกต้อง 100%

**Impact**: `DEPLOYMENT.md` (ต้องมี Chromium binary ใน deployment environment — Vercel serverless ต้องใช้ package เช่น `@sparticuz/chromium` ที่ compatible กับ serverless), Phase 11

**Review Trigger**: ถ้า cold-start ของ headless Chromium บน serverless ช้าเกินไป (>2-3 วินาที) ให้พิจารณาแยกเป็น dedicated microservice/queue สำหรับ PDF generation แทนการ render ใน request เดียวกัน

---

## D11 — Stock Transfer (Multi-branch) — Defer

**Decision**: คง `transfer` เป็น enum value ใน `inventory_movements.movement_type` ไว้ในโครง schema (เผื่ออนาคต) แต่ **ไม่ implement UI/logic ใน MVP** เพราะ MVP มีสาขาเดียว ไม่มีปลายทางให้โอน

**Rationale**: ตรงกับ `PROJECT_SCOPE.md` (multi-branch = future phase) ป้องกันการเสียเวลาสร้างฟีเจอร์ที่ใช้งานจริงไม่ได้ในสถานะปัจจุบัน

**Impact**: Phase 6 (ตัด task Transfer ออกจาก MVP scope, ระบุว่า "schema-ready only")

**Review Trigger**: เมื่อเปิด multi-branch phase

---

## D12 — สิทธิ์ Stock Adjustment (แก้ไข้ตัวเลขสต็อกอิสระ)

**Decision**: แยกสิทธิ์ระหว่าง "Stock In/Out ที่มีเอกสารอ้างอิง" (ผูกกับ purchase order หรือ sales transaction) กับ **"Adjustment" (แก้ตัวเลขอิสระ ไม่มีเอกสารอ้างอิง เช่น ของเสีย/นับสต็อกไม่ตรง)**

- Employee: ทำได้เฉพาะ Stock In (รับของจาก PO) และ Stock Out ที่มี **reason code จากรายการที่กำหนดไว้ล่วงหน้า** (เช่น "ของเสีย", "ตกแตก") — ห้ามทำ free-form adjustment
- Adjustment แบบอิสระ (แก้ตัวเลขไม่มี reason code จากลิสต์): **Manager/Owner เท่านั้น**

**Rationale**: ถ้า Employee แก้สต็อกอิสระได้โดยไม่มี reason code บังคับ = ช่องโหว่ปกปิดการโจรกรรม/ของหาย (ปรับตัวเลขให้ตรงกับที่นับได้โดยไม่ต้องอธิบาย) RBAC matrix เดิมใน SECURITY.md ระบุแค่ "Create (Stock movement เท่านั้น)" ซึ่งกว้างเกินไป

**Impact**: `SECURITY.md` §1 (RBAC matrix ต้องแยกคอลัมน์ย่อยของ Inventory), `DATABASE.md` (`inventory_movements.reason_code`), Phase 6

**Review Trigger**: ถ้าร้านต้องการ reason code เพิ่มเติมนอกลิสต์ default ให้เปิดเป็น configurable list ใน Settings แทน hardcode

---

## D13 — Auth Policy ขั้นต่ำ

**Decision**:

- Session timeout: 8 ชั่วโมง (อิงตามกะทำงานทั่วไป) — refresh ต้อง re-login
- Account lockout: ล็อก 15 นาทีหลัง login ผิด 5 ครั้งติดต่อกัน
- Password policy: ขั้นต่ำ 8 ตัวอักษร (ผสมตัวเลข) — ปรับได้ใน Settings ภายหลัง ไม่ hardcode ค่าตายตัวถ้าเป็นไปได้

**Rationale**: SECURITY.md เดิมไม่มีนโยบายเหล่านี้เลย ซึ่งเป็นพื้นฐานความปลอดภัยขั้นต่ำที่ต้องมีก่อน production

**Impact**: `SECURITY.md` §2, Phase 1

**Review Trigger**: ถ้า Owner ต้องการ session timeout สั้น/ยาวกว่านี้ตามลักษณะร้าน (เช่น แท็บเล็ตหน้าร้านที่ไม่ค่อย logout) ปรับได้โดยไม่กระทบ schema

---

## D14 — บทบาทเพิ่มเติมสำหรับองค์กร/ร้านจริง: Shift Supervisor และ Accountant

**Decision**: เพิ่ม 2 role ใหม่ในระบบ RBAC (รวมเป็น 6 role: Owner, Manager, **Shift Supervisor**, Cashier, Employee, **Accountant**)

1. **Shift Supervisor (หัวหน้าเวร/หัวหน้ากะ)** — พนักงานอาวุโสที่ดูแลหน้าร้านเมื่อ Owner/Manager ไม่อยู่ (ร้านเปิดหลายกะ เจ้าของไม่ได้อยู่ตลอดเวลา):
   - ทำ Stock In/Out ได้เหมือน Employee (มีเอกสาร/reason code อ้างอิง)
   - **ไม่มีสิทธิ์ทำ Adjustment อิสระ** เหมือน Employee (คงหลักการ D12 ไว้ — ป้องกันช่องโหว่ปกปิดของหายแม้เป็นหัวหน้าเวรก็ตาม)
   - อนุมัติ Refund ได้เองถ้ายอดไม่เกิน `refund_approval_threshold` (ปรับปรุง D5 — ดูด้านบน)
   - ดู Report ระดับกะของตัวเองได้ (สรุปยอดขายเพื่อส่งต่อกะถัดไป)
2. **Accountant / Bookkeeper (ฝ่ายบัญชี)** — บทบาทสำหรับนักบัญชี/สำนักงานบัญชีภายนอกที่ร้าน SME ไทยส่วนใหญ่ใช้บริการแบบ outsource รายเดือน (ไม่ใช่พนักงานประจำร้าน):
   - **View-only** ที่ Reports (Sales, Profit, Expense) เพื่อเตรียมยื่นภาษี (ภ.พ.30 รายเดือน, ภ.ง.ด. ประจำปี)
   - **Create/View** ที่ Expense (บันทึกค่าใช้จ่ายจากใบเสร็จจริง)
   - **ไม่มีสิทธิ์เข้า** POS, Inventory, Settings, User Management เด็ดขาด (least privilege เพราะเป็นบุคคลภายนอก)
   - Export CSV/PDF ได้ (ใช้แนบยื่นภาษี)

**คำชี้แจงสำคัญ**: RBAC role ในระบบคือ **ระดับสิทธิ์ (permission tier)** ไม่ใช่ตำแหน่งงาน (job title) — ตำแหน่งจริงในร้าน (บาริสต้า, พนักงานเสิร์ฟ, พนักงานทำความสะอาด ฯลฯ) แต่ละคนถูก map เข้า role ใดก็ได้ตามสิทธิ์ที่ควรได้รับ เช่น บาริสต้าที่ขายหน้าร้านด้วย → map เป็น Cashier, บาริสต้าที่ทำแค่เครื่องดื่มไม่แตะเงิน → map เป็น Employee

**Invite hierarchy ที่ปรับปรุง** (แทนที่กฎเดิมใน D6 บางส่วน):

- Owner: invite ได้ทุก role รวมถึง Owner ร่วม (co-owner) และ Accountant
- Manager: invite ได้เฉพาะ Shift Supervisor, Cashier, Employee (**ห้าม invite Accountant** เพราะเป็นบุคคลภายนอกที่เห็นข้อมูลการเงินระดับสูง ต้องผ่าน Owner เท่านั้น)

**Rationale**: ร้านเครื่องดื่มไทยที่มีมากกว่า 1 กะ/วัน แทบทั้งหมดมีคนที่ไม่ใช่ Owner/Manager คอยตัดสินใจหน้าร้านจริง (หัวหน้าเวร) และร้าน SME ส่วนใหญ่ใช้สำนักงานบัญชีภายนอกทำบัญชี/ยื่นภาษีแทนการจ้างนักบัญชีประจำ — การให้สิทธิ์เข้าระบบตรง ๆ (แทนส่งไฟล์มือ) คือประสิทธิภาพที่แท้จริงที่ต้องรองรับตั้งแต่ RBAC ระดับ schema ไม่ใช่ patch ทีหลัง

**Impact**: `SECURITY.md` §1 (ขยาย matrix เป็น 6 คอลัมน์), `DATABASE.md` (enum `role` เพิ่มค่า), `REQUIREMENTS.md` §A2, Phase 2

**Review Trigger**: ถ้าร้านมีหลายสาขาในอนาคต อาจต้องเพิ่ม "Area Manager" คั่นระหว่าง Owner กับ Manager — ออกแบบ role enum ให้ขยายได้ง่าย (ไม่ hardcode จำนวน role ในโค้ด)

**หมายเหตุ Hard-Stop**: การเพิ่ม role ใหม่กระทบ Authorization โดยตรงตามเกณฑ์ `AGENTS.md` §2 — บันทึกเป็น default ที่ผ่านการวิเคราะห์แล้ว แต่**ควรได้รับการยืนยันจากเจ้าของร้านจริงก่อน implement Phase 2**

---

## D15 — PDPA Compliance (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562)

**Decision**: ระบบต้องปฏิบัติตาม PDPA เพราะเก็บข้อมูลส่วนบุคคลของพนักงาน (ชื่อ, อีเมล, ประวัติการล็อกอิน) เป็นอย่างน้อย แม้ MVP จะยังไม่เก็บข้อมูลลูกค้าก็ตาม

- **ฐานทางกฎหมายในการเก็บข้อมูลพนักงาน**: ใช้ "ความจำเป็นเพื่อปฏิบัติตามสัญญาจ้างงาน/สัญญาการใช้งานระบบ" (มาตรา 24(3)) ไม่ต้องขอ consent แยกทุกครั้ง แต่ต้องแจ้ง Privacy Notice ให้พนักงานทราบตอน invite ครั้งแรก
- **Data Subject Rights ขั้นต่ำที่ต้อง implement**: สิทธิขอเข้าถึงข้อมูลตนเอง, สิทธิขอแก้ไขข้อมูลตนเอง (ชื่อ/อีเมล), สิทธิขอให้ลบ/ปิดการใช้งานบัญชีเมื่อพ้นสภาพพนักงาน (soft-delete/deactivate ตาม `DATABASE.md` §4 อยู่แล้ว แต่ข้อมูลที่ผูกกับธุรกรรม append-only ต้อง**เก็บไว้เพื่อ audit trail** ไม่ลบจริง — อธิบายให้ผู้ใช้เข้าใจว่าสิทธิ "ลบ" ไม่ครอบคลุมข้อมูลธุรกรรมทางบัญชี)
- **ไม่เก็บข้อมูลเกินความจำเป็น (data minimization)**: ห้ามเก็บข้อมูลส่วนบุคคลลูกค้า (เช่น เบอร์โทร, วันเกิด) ใน MVP เพราะไม่มี business need (Loyalty/CRM อยู่นอกขอบเขต — ดู `PROJECT_SCOPE.md`) การเก็บโดยไม่จำเป็นเพิ่มความเสี่ยงทางกฎหมายเปล่า ๆ
- **Data Breach**: ถ้าเกิดเหตุข้อมูลรั่วไหลที่มีความเสี่ยงกระทบสิทธิผู้ใช้ เจ้าของระบบ (ในฐานะ Data Controller) มีหน้าที่แจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส./PDPC) ภายใน 72 ชั่วโมงตามที่กฎหมายกำหนด — ต้องมีแผน incident response ขั้นต่ำก่อน production (เชื่อมกับ `DEPLOYMENT.md` §5 Monitoring)

**Rationale**: PDPA บังคับใช้จริงตั้งแต่ 1 มิ.ย. 2565 กับธุรกิจทุกขนาดที่ประมวลผลข้อมูลส่วนบุคคล ไม่ใช่แค่บริษัทใหญ่ — ร้านที่มีระบบเก็บข้อมูลพนักงาน (ชื่อ, อีเมล, สิทธิ์การเข้าถึง) เข้าข่ายเป็น Data Controller ตามกฎหมายทันที การไม่ระบุแนวทางไว้ตั้งแต่ต้นจะเป็นความเสี่ยงทางกฎหมายจริงเมื่อ deploy

**Impact**: `SECURITY.md` (เพิ่มหัวข้อ PDPA), Phase 1 (Privacy Notice ตอน invite), Phase 2 (User self-service ดู/แก้ข้อมูลตนเอง)

**Review Trigger**: ถ้าในอนาคตเก็บข้อมูลลูกค้า (เช่น เปิด Loyalty/CRM) ต้องทบทวนฐานทางกฎหมายใหม่ทั้งหมด (จะต้องขอ consent จากลูกค้าโดยตรง ไม่ใช่ฐาน "สัญญาจ้างงาน" แบบพนักงาน)

**หมายเหตุ**: นี่คือสรุปหลักการทั่วไปสำหรับวางแนวทางระบบ ไม่ใช่คำแนะนำทางกฎหมายที่สมบูรณ์ — ก่อน production จริง ควรให้ผู้เชี่ยวชาญ/ที่ปรึกษากฎหมายตรวจสอบ PDPA compliance อีกครั้งตามลักษณะการดำเนินธุรกิจจริง

---

## D16 — ใบกำกับภาษีอย่างย่อ (Tax Invoice) ตามประมวลรัษฎากร

**Decision**: ใบเสร็จที่ POS ออก (Phase 8) ต้องมีข้อมูลครบตามข้อกำหนด "ใบกำกับภาษีอย่างย่อ" (มาตรา 86/6 ประมวลรัษฎากร) สำหรับร้านที่จดทะเบียนภาษีมูลค่าเพิ่ม:

- คำว่า "ใบกำกับภาษีอย่างย่อ" ปรากฏบนใบเสร็จ
- ชื่อ, เลขประจำตัวผู้เสียภาษีอากร (13 หลัก), ที่อยู่ของผู้ประกอบการ (และสาขา ถ้ามี) — เก็บใน `company_settings`
- เลขที่ใบกำกับภาษีแบบรันนิ่งนัมเบอร์ต่อเนื่อง ห้ามข้าม/ซ้ำ (ผูกกับ `sales_transactions` — เลขที่ไม่ reset เมื่อมี void, เฉพาะ transaction จริงเท่านั้นที่กินเลข)
- วันที่ออก, รายการสินค้า/บริการ, จำนวนเงินรวม VAT (หรือแยกแสดง VAT ก็ได้ตาม `vat_mode` — ดู D9)
- ถ้าลูกค้าขอใบกำกับภาษีเต็มรูป (สำหรับนิติบุคคล) ต้องมีช่องกรอกชื่อ/ที่อยู่/เลขผู้เสียภาษีของผู้ซื้อเพิ่มเติมได้ (ไม่บังคับใน MVP แต่เผื่อ field ไว้)

**Rationale**: นี่ไม่ใช่ทางเลือกด้าน UX แต่เป็นข้อกำหนดทางกฎหมายจริงสำหรับผู้ประกอบการที่จด VAT — ใบเสร็จที่ขาดข้อมูลเหล่านี้ไม่ใช่ใบกำกับภาษีที่สมบูรณ์ตามกฎหมาย ผู้ประกอบการอาจถูกปรับได้ ถ้าไม่ออกแบบ field ไว้ตั้งแต่ Phase 3 (Settings)/Phase 8 (POS) จะต้องแก้ schema ใบเสร็จทีหลังซึ่งกระทบเอกสารที่ออกไปแล้ว (append-only)

**Impact**: `DATABASE.md` (`company_settings.tax_id`, running number sequence บน `sales_transactions`), `SECURITY.md`/`REQUIREMENTS.md` §A12, Phase 8, Phase 12

**Review Trigger**: ร้านที่ยังไม่ได้จด VAT (รายได้ไม่ถึงเกณฑ์) ไม่บังคับต้องออกใบกำกับภาษี — ต้องมี Settings toggle "จดทะเบียน VAT หรือไม่" ที่ควบคุมว่าจะแสดง field เหล่านี้บนใบเสร็จหรือไม่ (เชื่อมกับ `vat_mode` ใน D9)

**หมายเหตุ**: สรุปหลักการทั่วไปตามประมวลรัษฎากร ไม่ใช่คำแนะนำทางภาษีที่สมบูรณ์ — ควรตรวจสอบกับผู้ทำบัญชี/สรรพากรพื้นที่อีกครั้งตามประเภทการจดทะเบียนจริงของร้าน

---

## D17 — ระยะเวลาเก็บเอกสาร/ข้อมูลย้อนหลัง (Data Retention)

**Decision**: เก็บข้อมูลธุรกรรมทั้งหมด (`sales_transactions`, `inventory_movements`, `expense_entries` และเอกสารอ้างอิง) ไว้ **อย่างน้อย 5 ปี** โดยไม่ลบออกจากระบบจริง (soft-retain) ตามอายุความบัญชี — ถ้าต้องลดขนาดฐานข้อมูล ให้ archive ไปเก็บที่อื่น ไม่ใช่ลบทิ้ง

**Rationale**: พ.ร.บ.การบัญชี พ.ศ. 2543 มาตรา 14 กำหนดให้ผู้มีหน้าที่จัดทำบัญชีต้องเก็บบัญชีและเอกสารประกอบการลงบัญชีไว้ไม่น้อยกว่า 5 ปี (กรมสรรพากรอาจสั่งขยายเป็นไม่เกิน 7 ปีในบางกรณี) การออกแบบระบบให้ลบ/purge ข้อมูลอัตโนมัติโดยไม่รู้ตัวจะขัดกฎหมายบัญชีโดยตรง

**Impact**: `DEPLOYMENT.md` §4 (Backup strategy ต้องครอบคลุม retention), `ARCHITECTURE.md` §4 (Immutable Ledger สอดคล้องกับข้อนี้อยู่แล้วโดยธรรมชาติ), Phase 14

**Review Trigger**: ถ้าร้านจดทะเบียนเป็นนิติบุคคลและมีการตรวจสอบพิเศษจากกรมสรรพากรที่สั่งขยายเป็น 7 ปี ให้ปรับ retention policy ตามคำสั่งนั้น

**หมายเหตุ**: สรุปหลักการทั่วไป ไม่ใช่คำแนะนำทางกฎหมายที่สมบูรณ์ — ควรตรวจสอบกับผู้ทำบัญชีตามประเภทการจดทะเบียนจริงของร้าน

---

## D18 — User Acceptance Testing (UAT) ก่อน Go-Live

**Decision**: เพิ่มขั้นตอน UAT เป็นส่วนหนึ่งของ Phase 13 (Testing) โดยบังคับให้ **Owner และตัวแทนพนักงานที่ใช้งานจริงแต่ละ role** (อย่างน้อย 1 Cashier, 1 Shift Supervisor ถ้ามี) ทดสอบ workflow จริงก่อน sign-off ไป production — ไม่ใช่แค่ automated test ผ่านแล้วถือว่าจบ

**Rationale**: Automated test (Unit/Integration/E2E) ยืนยันว่าโค้ด "ทำงานตามสเปก" แต่ไม่ยืนยันว่า "สเปกตรงกับการใช้งานจริงหน้าร้าน" — ร้านเครื่องดื่มมี edge case ปฏิบัติงานจริงที่คาดเดาจากเอกสารอย่างเดียวไม่ได้ครบ (เช่น ความเร็วที่ Cashier กดจริงตอนคิวยาว) ต้องให้คนที่จะใช้งานจริงลองก่อน sign-off

**Impact**: `TESTING.md` (เพิ่มหัวข้อ UAT), Phase 13

**Review Trigger**: ทุกครั้งที่มี Feature ใหม่กระทบ POS/Inventory workflow หลัก MVP ต้องผ่าน UAT รอบย่อมซ้ำ ไม่ใช่แค่รอบแรกตอน launch

---

## D19 — เจ้าของร้านตั้งค่าสิทธิ์เข้าหน้าเมนูได้เอง (Owner-Configurable Page Access)

**Decision**: เพิ่มตาราง `role_page_permissions` ให้เจ้าของร้านกำหนดเองได้ว่าแต่ละตำแหน่ง (role) เปิดหน้าเมนูไหนได้บ้าง — คุมแค่ระดับ "เข้าหน้าได้ไหม" เท่านั้น ไม่แตะระดับการกระทำ (สร้าง/แก้/ลบ) ซึ่งยังคุมโดยตาราง `lib/permissions.ts` เดิม `owner` ไม่มีแถวในตารางนี้และเข้าได้ทุกหน้าเสมอ ไม่มีทางถูกปิดกั้นตัวเอง `/dashboard` และ `/guide` ไม่อยู่ในระบบนี้ (ดูรายละเอียดที่ `docs/superpowers/specs/2026-07-30-role-page-permissions-design.md`)

**ขอบเขต: ปิดได้อย่างเดียว (revoke-only)** — เจ้าของร้าน "ปิด" การเข้าถึงหน้าที่ตำแหน่งนั้นเคยเข้าได้ตามค่าเริ่มต้นได้ และเปิดกลับคืนได้ แต่ **ให้สิทธิ์เกินค่าเริ่มต้น (seed) ไม่ได้** ค่า seed คือเพดานสูงสุด เหตุผล: feature นี้ไม่แตะ CRUD matrix ใน `lib/permissions.ts` เลย การ "ให้สิทธิ์" หน้าที่ตัว data fetch ยังติด `requirePermission()` อยู่ จะได้แค่หน้าที่เปิดแล้ว error หรือเด้งกลับ บังคับจริงฝั่ง server ที่ `updateRolePagePermissions()` (เทียบกับ `DEFAULT_ALLOWED_ROLES`) ไม่ใช่แค่ disable checkbox ฝั่ง client

**Rationale**: ก่อนหน้านี้แต่ละหน้าเขียนเช็คสิทธิ์เองแบบ hardcode (`if (role === "cashier") redirect(...)`) กระจายอยู่ 13 ไฟล์ เจ้าของร้านแก้อะไรไม่ได้เลยนอกจากขอให้แก้โค้ดแล้ว deploy ใหม่ ทำให้ปรับสิทธิ์ตามการเปลี่ยนแปลงหน้างานจริงไม่ทัน

**Impact**: `SECURITY.md` §1 (เพิ่มหมายเหตุว่าการเข้าหน้าเมนูตอนนี้เป็น runtime-configurable, ไม่ใช่ hardcode), Phase ใหม่ (เพิ่มหน้าเมนู 14 ต้องเพิ่มแถว default ให้ `RolePagePermission` ด้วยเสมอ มิฉะนั้นทุก role เข้าไม่ได้โดยปริยาย)

**Review Trigger**: ถ้าในอนาคตต้องคุมระดับการกระทำ (create/update/delete) แบบตั้งค่าได้เหมือนกัน ไม่ใช่แค่ระดับหน้า ให้ทบทวนใหม่ทั้งระบบร่วมกับ `lib/permissions.ts` แทนที่จะแปะเพิ่มทีละจุด

---

## D-Note: รายการที่ตั้งใจ "ยังไม่ตัดสิน" (Deferred Open Question)

- **Offline-tolerant POS** (จาก `PROJECT_SCOPE.md`): ยังคงเป็น open question ที่ต้องตัดสินก่อน Phase 8 จริง ๆ — ไม่ได้ตัดสินในรอบนี้เพราะเป็น decision ที่กระทบ conflict-resolution design ทั้งระบบ ต้องคุยกับ Owner โดยตรงว่าอัตราการเน็ตหลุดในร้านสูงแค่ไหน (Hard Stop ตาม `AGENTS.md` §2)
- **Partial refund ระดับ item**: D5 ตัดสินที่ระดับ transaction ก่อนสำหรับ MVP แต่แนะนำให้ Database design เผื่อ `sales_transaction_items.reversed_quantity` ไว้ตั้งแต่ Phase 8 เพื่อไม่ต้อง breaking change ถ้าต้องขยายภายหลัง

---

## Index อ้างอิงด่วน

| #   | หัวข้อ                             | กระทบเอกสาร                        | กระทบ Phase |
| --- | ---------------------------------- | ---------------------------------- | ----------- |
| D1  | Costing Method (WAC)               | DATABASE, ARCHITECTURE             | 3, 7        |
| D2  | Unit Conversion                    | DATABASE                           | 3, 7        |
| D3  | Menu Variant/Modifier              | DATABASE, ARCHITECTURE, UI_UX      | 4, 5, 8     |
| D4  | Stock ไม่พอที่ POS                 | DATABASE, API, SECURITY            | 6, 8        |
| D5  | Refund/Void                        | SECURITY, DATABASE, UI_UX          | 8           |
| D6  | User Bootstrap/Invite              | SECURITY, DATABASE                 | 1, 2        |
| D7  | Prisma/RLS Ownership               | ARCHITECTURE, DEPLOYMENT, SECURITY | 0, 14       |
| D8  | Timezone/Business Day              | DATABASE                           | 10, 11, 12  |
| D9  | VAT/Discount/Rounding              | DATABASE                           | 8, 9, 11    |
| D10 | PDF Export                         | DEPLOYMENT                         | 11          |
| D11 | Transfer (defer)                   | —                                  | 6           |
| D12 | Adjustment Permission              | SECURITY, DATABASE                 | 6           |
| D13 | Auth Policy                        | SECURITY                           | 1           |
| D14 | Shift Supervisor & Accountant Role | SECURITY, DATABASE, REQUIREMENTS   | 2           |
| D15 | PDPA Compliance                    | SECURITY                           | 1, 2        |
| D16 | Tax Invoice (ใบกำกับภาษีอย่างย่อ)  | DATABASE, SECURITY, REQUIREMENTS   | 8, 12       |
| D17 | Data Retention (5 ปี)              | DEPLOYMENT, ARCHITECTURE           | 14          |
| D18 | User Acceptance Testing (UAT)      | TESTING                            | 13          |
| D19 | Owner-Configurable Page Access     | SECURITY, DATABASE, ARCHITECTURE   | 14          |

**⚠️ รอการยืนยันจากผู้ใช้ (Hard-Stop ตาม `AGENTS.md` §2)**: D6, D7, D12, D13, D14
