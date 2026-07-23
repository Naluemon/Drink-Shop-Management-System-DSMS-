# ARCHITECTURE.md — Drink Shop Management System (DSMS)

## 1. Layering

```
Client (Next.js UI, shadcn/ui)
   │
Server Actions / Route Handlers   ← Authorization check ที่นี่ (จุดเดียวที่พึ่งพาได้จริง)
   │
Service Layer (business logic: cost cascade, stock deduction)
   │
Prisma Client
   │
Postgres (Supabase)               ← RLS ป้องกันเฉพาะการเข้าถึงนอก path แอป (ดู §2)
```

หลักการ: **ทุก request ต้องผ่านการตรวจสิทธิ์ที่ Server Action/Route Handler ก่อนเสมอ**
ห้ามให้ client เรียก Prisma ตรง และห้ามพึ่งพา RLS เป็นด่านของ request ปกติ

## 2. เหตุผล: ทำไมต้องตรวจสิทธิ์ที่ Application Layer เป็นหลัก

Prisma เชื่อมต่อ Postgres ผ่าน connection string โดยตรง ซึ่ง **ไม่ได้ผูกกับ JWT/role ของ Supabase Auth เลย**
เพราะ connection ที่ Prisma ใช้มีสิทธิ์สูง (service role) RLS **จะไม่ทำงานกับ query จาก path ปกติของแอปเลย ไม่ว่ากรณีใด**

**แนวทางที่ใช้ในโปรเจกต์นี้ (ปรับปรุงตาม `DECISIONS.md` D7):**

1. ตรวจ role/permission จาก session (Supabase Auth) ใน Server Action/Route Handler ก่อนเรียก Prisma ทุกครั้ง — เป็น**ด่านเดียวที่ปกป้อง request ปกติของแอปได้จริง**
2. เปิด RLS บนตาราง Postgres ไว้เพื่อป้องกัน **"การเข้าถึง DB นอก path แอป"** เท่านั้น (เช่น มีคนเข้า Supabase Dashboard ตรง หรือ credential รั่ว) — **ไม่ใช่ด่านที่สองของ request ปกติ** ห้ามออกแบบ feature ใดที่พึ่งพา RLS เป็นตัวป้องกัน authorization ของ flow ปกติ เพราะมันจะไม่ทำงานเลย
3. RBAC matrix เต็มอยู่ใน `SECURITY.md` — ต้องตรงกับ Application-layer check เสมอ ส่วน RLS policy เขียนแยกต่างหากสำหรับ defense-in-depth เท่านั้น (การ apply/versioning ดู `DECISIONS.md` D7)

## 3. Cost Cascade (Ingredient → Recipe → Menu → Variant/Modifier)

ปัญหา: ต้นทุนวัตถุดิบเปลี่ยน → ต้องกระทบ recipe cost → กระทบ menu cost → กระทบ variant/modifier cost แบบ dependency chain

**แนวทาง**: On-write recalculation

- เมื่อ ingredient cost เปลี่ยน (WAC recalculate หลังรับของ — ดู `DECISIONS.md` D1) → trigger recalculate recipe cost ที่ใช้ ingredient นั้นทันที (ผ่าน service layer function เดียว ห้ามกระจาย logic หลายที่)
- Menu cost = คำนวณจาก recipe cost ปัจจุบันเสมอ (ไม่ cache แยก หรือถ้า cache ต้อง invalidate พร้อมกัน)
- **Menu Variant cost** = `recipe_cost × variant.recipe_multiplier` หรือ cost ของ `override_recipe_id` ถ้า variant ใช้สูตรแยก (ดู `DATABASE.md` §7)
- **Modifier cost** = ต้นทุนของ `modifier.ingredient_id` × `ingredient_quantity` (ถ้ามี ingredient ผูกอยู่ — บาง modifier เช่นระดับความหวานไม่มี ingredient จึงไม่มี cost เพิ่ม)
- **ยอดต้นทุนต่อรายการขาย** = `recipe_cost × variant_multiplier + Σ(modifier costs ที่เลือก)` — คำนวณสูตรนี้ที่จุดเดียวใน service layer (`calculateSaleItemCost` หรือเทียบเท่า) ห้าม duplicate logic ไว้ทั้งใน POS UI และ service
- **ข้อยกเว้นสำคัญ**: ธุรกรรมการขาย (POS) ต้องบันทึก **cost snapshot ณ เวลาขาย** (รวม recipe + variant + modifier ทั้งหมดข้างต้น) แยกจาก live cost เพื่อไม่ให้รายงานย้อนหลังผิดเพี้ยนเมื่อต้นทุนเปลี่ยนภายหลัง (ดู `AGENTS.md` §4)

## 4. Immutable Ledger Pattern

ตารางที่เป็นธุรกรรมทางการเงิน/สต็อกต้องเป็น **append-only**:

- `sales_transactions`, `sales_transaction_items`, `sales_transaction_item_modifiers`, `inventory_movements`, `expense_entries`
- ห้าม UPDATE/DELETE แถวที่มีอยู่แล้ว
- การแก้ไข = สร้างแถวใหม่ประเภท reversal/adjustment ที่อ้างอิงแถวเดิม (รายละเอียด void/refund workflow ดู `DECISIONS.md` D5, stock adjustment ดู D12)
- ทำให้ report (Phase 11) ตรวจสอบย้อนกลับได้ 100%

## 5. Multi-Branch Readiness

แม้ MVP รองรับ 1 สาขา แต่ทุกตารางธุรกิจ (ingredient, recipe, menu, menu_variant, modifier, inventory, sales, expense)
ต้องมีคอลัมน์ `branch_id` ตั้งแต่ Phase 3 เป็นต้นไป (default = สาขาเดียวที่มีอยู่)
เหตุผล: การเพิ่มคอลัมน์นี้ทีหลังกระทบทุก query และ index ทั้งระบบ ทำตั้งแต่ต้นถูกกว่ามาก

## 6. Business Day & Timezone Handling

ทุก timestamp เก็บเป็น UTC เสมอ แต่การ group ข้อมูลเป็น "รายวัน" (Dashboard, Reports) ต้องคำนวณผ่าน
`company_settings.timezone` + `company_settings.business_day_start_hour` (ดู `DECISIONS.md` D8) — ห้ามใช้ calendar day
(เที่ยงคืน UTC หรือ local เฉย ๆ) ตรงในการ query แบบ hardcode เพราะร้านที่เปิดถึงดึกจะได้ตัวเลขผิด ต้องมี utility function
กลางจุดเดียว (เช่น `getBusinessDayRange(date)`) ให้ทุก query ที่เกี่ยวกับรายวันเรียกใช้ร่วมกัน

## 7. Non-Functional Requirements

- Dashboard ต้องโหลดภายใน 2 วินาที (Phase 10)
- ทุก endpoint ที่แก้ไขสต็อก/เงินต้องเป็น atomic transaction (ใช้ Prisma `$transaction`) — รวมถึง POS checkout ที่กระทบทั้ง sales, inventory, และ modifier records พร้อมกันในธุรกรรมเดียว
- Error handling: ทุก service layer function ต้อง throw typed error ที่ map ไปเป็น HTTP/UI error message ที่เหมาะสม (ไม่ leak internal detail)
- PDF generation (Phase 11) ใช้ headless Chromium server-side (ดู `DECISIONS.md` D10) — ต้องพิจารณา cold-start time เป็น non-functional constraint ของ deployment
