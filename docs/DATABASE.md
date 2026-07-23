# DATABASE.md — Drink Shop Management System (DSMS)

> **สถานะ**: เอกสารนี้ระบุ "หลักการและข้อบังคับ" ของ schema พร้อม Entity/Field ระดับที่ตัดสินใจแล้ว
> ยังไม่ใช่ Full ERD/DDL — การเขียน `schema.prisma` จริงเป็นขั้นต่อไป แต่ต้องยึดทุกตาราง/คอลัมน์ในเอกสารนี้เป็นข้อบังคับ ห้ามออกแบบขัดกัน
> คำศัพท์ที่ใช้ในเอกสารนี้ ดูนิยามที่ `GLOSSARY.md` — ที่มาของการตัดสินใจแต่ละจุด ดู `DECISIONS.md`

## 1. Naming Convention

- ชื่อตาราง: `snake_case`, พหูพจน์ (เช่น `ingredients`, `sales_transactions`)
- Primary key: `id` (UUID)
- Foreign key: `<entity>_id` (เช่น `ingredient_id`)
- Timestamp: `created_at`, `updated_at` (ทุกตาราง), `created_by`, `updated_by` (ทุกตารางที่แก้ไขได้)
- Enum column: `<entity>_type` หรือ `status` เป็น Postgres enum เสมอ (ไม่ใช้ string อิสระ) เพื่อกัน typo และให้ constraint ระดับ DB

## 2. คอลัมน์บังคับสำหรับทุกตารางธุรกิจ

| คอลัมน์                    | เหตุผล                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `branch_id`                | เตรียมพร้อม multi-branch ตั้งแต่ Phase 3 (ดู `ARCHITECTURE.md` §5) — MVP ใส่ default เดียว |
| `created_at`, `created_by` | Audit trail ขั้นต่ำ                                                                        |
| `updated_at`, `updated_by` | ใช้เฉพาะตารางที่แก้ไขได้จริง (ตาราง append-only ไม่มี `updated_*`)                         |

## 3. Append-only Tables (ห้าม UPDATE/DELETE)

- `sales_transactions` + `sales_transaction_items` (เก็บ cost snapshot ต่อรายการ) + `sales_transaction_item_modifiers`
- `inventory_movements` (stock in/out/adjustment/reversal ทุกประเภทเป็นแถวใหม่เสมอ; `transfer` เป็น enum ที่เตรียมไว้แต่ยังไม่ใช้งาน — ดู `DECISIONS.md` D11)
- `expense_entries`

รายละเอียดวิธี "แก้ไข" ข้อมูลในตารางเหล่านี้ ดู `ARCHITECTURE.md` §4 (Immutable Ledger Pattern) — สรุป: สร้างแถวประเภท `reversal`/`adjustment` ใหม่ที่อ้างอิงแถวเดิม ห้าม UPDATE/DELETE เด็ดขาด

## 4. Soft-delete vs Hard-delete

- Master data (ingredients, recipes, menus, menu_variants, modifiers, suppliers): ใช้ **soft-delete** (`deleted_at` nullable) เพราะอาจถูกอ้างอิงจากธุรกรรมเก่า
- ตาราง append-only: ไม่มีแนวคิด delete เลย (ใช้ reversal entry แทน)

## 5. Entity Group Overview (ระดับสูง — ยังไม่ใช่ ERD)

- **Identity & Access**: `users`, `roles`, `permissions`, `user_invites`
- **Catalog**: `ingredients`, `unit_conversions`, `recipes`, `recipe_ingredients`, `menus`, `menu_categories`, `menu_variants`, `modifier_groups`, `modifiers`
- **Inventory**: `inventory_movements`, `suppliers`, `purchase_orders`, `purchase_order_items`
- **Sales**: `sales_transactions`, `sales_transaction_items`, `sales_transaction_item_modifiers`, `discounts`
- **Finance**: `expense_entries`, `expense_categories`
- **Settings**: `company_settings`, `tax_settings`, `branches`

## 6. Ingredient & Costing Fields (D1, D2)

**วิธีคิดต้นทุน**: Weighted Average Cost (WAC) — รายละเอียดสูตรและ bootstrap value ก่อนมี PO ครั้งแรก ดู `DECISIONS.md` D1

`ingredients`:

- `base_unit` — enum `gram` | `ml` | `piece` เท่านั้น (หน่วยที่ใช้ในสูตรเสมอ)
- `cost_per_unit` — ราคาต่อ `base_unit` คำนวณจาก WAC เสมอ (ยกเว้นค่า bootstrap มือก่อน Phase 7)
- `current_stock_qty` — หน่วยเป็น `base_unit` เสมอ (แปลงจาก purchase_unit ทันทีที่รับของ)

`unit_conversions` (ตารางใหม่ — 1 ingredient มีได้หลาย purchase_unit):

- `ingredient_id`, `purchase_unit_name` (เช่น "กล่อง 946ml", "ลัง 24 ขวด"), `conversion_factor` (1 purchase_unit = กี่ `base_unit`)

`recipe_ingredients.quantity`, `recipes.yield` → ใช้คำนวณ recipe cost (หน่วยอ้างอิง `base_unit` ของ ingredient เสมอ)

## 7. Menu Variant & Modifier (D3)

โครงสร้างนี้แทนที่แนวคิดเดิมที่ "1 menu = 1 recipe = 1 cost" เพราะร้านเครื่องดื่มขาย size/topping/ความหวานแยกราคาและแยกต้นทุนจริง

`menu_variants` (เช่น Size S/M/L):

- `menu_id`, `name`, `recipe_multiplier` (decimal, คูณกับ recipe cost หลัก) หรือ `override_recipe_id` (nullable, ถ้า variant ใช้สูตรคนละตัวเลย ไม่ใช่แค่คูณปริมาณ), `price_delta` (ส่วนต่างราคาจาก base price ของ menu), `is_default`

`modifier_groups` (เช่น "ความหวาน", "Topping"):

- `name`, `selection_type` (enum `single` | `multiple`), `is_required`

`modifiers` (ตัวเลือกในกลุ่ม เช่น "ไข่มุก", "หวาน 50%"):

- `modifier_group_id`, `name`, `ingredient_id` (nullable — null ถ้าไม่กินสต็อก เช่น ระดับความหวานที่ไม่ใช้วัตถุดิบเพิ่ม), `ingredient_quantity` (nullable, หน่วย `base_unit` ของ ingredient), `price_delta`

`sales_transaction_item_modifiers` (append-only, บันทึกตอนขายว่ารายการนี้เลือก modifier อะไรบ้าง):

- `sales_transaction_item_id`, `modifier_id`, `modifier_name_snapshot`, `price_delta_snapshot`, `ingredient_cost_snapshot` (nullable)

## 8. Sales & Reversal Fields (D4, D5, D9)

`sales_transactions`:

- `reversal_of_id` (nullable, self-reference) — ถ้าไม่ null แสดงว่าแถวนี้คือ void/refund ของแถวที่อ้างถึง
- `void_reason` (nullable) — บังคับกรอกเมื่อเป็น void/refund
- `approved_by` (nullable) — บังคับกรอกเมื่อเป็น refund หลังปิดกะ (ไม่บังคับสำหรับ void ในกะเดียวกัน)
- `discount_amount` — ส่วนลดระดับบิล (จำนวนเงิน ไม่ใช่ %)
- `rounding_adjustment` — ผลต่างจากการปัดเศษยอดรวม (ดู `DECISIONS.md` D9)
- `vat_mode_snapshot`, `vat_rate_snapshot` — snapshot ค่า ณ เวลาขาย ไม่ผูกกับ `tax_settings` ปัจจุบัน

`sales_transaction_items`:

- `cost_at_sale_time` (คำนวณรวม recipe cost × variant_multiplier ณ เวลาขาย)
- `discount_amount` — ส่วนลดระดับรายการ
- `reversed_quantity` — เผื่อ partial refund ระดับ item ในอนาคต (ดู `DECISIONS.md` D-Note, ค่า default 0 ใน MVP)

`inventory_movements`:

- `movement_type` — enum `stock_in` | `stock_out` | `adjustment` | `reversal` | `transfer` (transfer ยังไม่ใช้งานจริง — D11)
- `reason_code` (nullable) — บังคับกรอกเมื่อ `movement_type = stock_out` โดย Employee หรือ `adjustment` ใด ๆ (ดู `DECISIONS.md` D12), อ้างอิง list ที่กำหนดไว้ล่วงหน้าใน Settings
- `is_stock_deficit` — true เมื่อ movement นี้ทำให้สต็อกติดลบ (ดู `DECISIONS.md` D4)
- `reversal_of_id` (nullable, self-reference)

## 9. Identity & Access Fields (D6, D13, D14 — ⚠️ role list รอยืนยันจากผู้ใช้)

`users`: `role` (enum `owner` | `manager` | `shift_supervisor` | `cashier` | `employee` | `accountant` — ดู `DECISIONS.md` D14), `is_active`, `failed_login_count`, `locked_until` (nullable)

`user_invites` (ตารางใหม่): `email`, `role`, `invited_by`, `token`, `expires_at`, `accepted_at` (nullable) — ดูกลไก bootstrap owner คนแรก + invite-only ที่ `DECISIONS.md` D6, และข้อจำกัดว่า role ไหน invite role ไหนได้ที่ D14

## 10. Settings Fields (D8, D9)

`company_settings`: `timezone` (default `Asia/Bangkok`), `business_day_start_hour` (default `05:00`)

`tax_settings`: `vat_mode` (enum `inclusive` | `exclusive` | `none`, default `inclusive`), `vat_rate` (default `7.00`), `refund_approval_threshold` (จำนวนเงิน, default `500.00` — ดู `DECISIONS.md` D5/D14)

## 11. Tax Invoice Fields (D16) และ Data Retention (D17)

**Tax Invoice (ใบกำกับภาษีอย่างย่อ)** — ใช้เมื่อ `company_settings.is_vat_registered = true`:

- `company_settings`: `tax_id` (เลขประจำตัวผู้เสียภาษี 13 หลัก), `registered_name`, `registered_address`, `is_vat_registered` (boolean)
- `sales_transactions`: `tax_invoice_number` (running number ต่อเนื่อง ไม่ reset, กินเลขเฉพาะ transaction จริงที่ไม่ใช่ voided ก่อนออกใบเสร็จ — ดู `DECISIONS.md` D16)

**Data Retention (D17)**: ไม่มี field เพิ่ม แต่เป็นข้อบังคับระดับ operational — ห้ามมี job ที่ลบ/purge `sales_transactions`, `inventory_movements`, `expense_entries` และตารางอ้างอิงโดยอัตโนมัติภายใน 5 ปีนับจากวันที่บันทึก (ดู `DEPLOYMENT.md` §4)

## Next Step

เมื่อพร้อมออกแบบ schema เต็มรูปแบบ (ERD + DDL + Prisma `schema.prisma`) ให้เริ่มจากเอกสารนี้ + `DECISIONS.md` เป็น input หลัก ห้ามออกแบบ field ที่ขัดกับหลักการในเอกสารทั้งสองนี้โดยไม่อัปเดตพร้อมกัน
