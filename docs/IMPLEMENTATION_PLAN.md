# IMPLEMENTATION_PLAN.md — Drink Shop Management System (DSMS)

> Master Plan ของโปรเจกต์ทั้งหมด ทุก Phase ต้องอ้างอิงเอกสารนี้เป็นหลัก
> เอกสารที่เกี่ยวข้อง: `PROJECT_SCOPE.md`, `DECISIONS.md`, `GLOSSARY.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`,
> `SECURITY.md`, `UI_UX.md`, `TESTING.md`, `DEPLOYMENT.md`
>
> **ก่อนเริ่ม Phase ใด ให้เช็ค `DECISIONS.md` ว่ามีการตัดสินใจที่เกี่ยวข้องหรือยัง — ห้ามเดาใหม่ถ้ามีคำตอบอยู่แล้ว**

**Status**: Planning

---

## Objective

พัฒนาเว็บแอปพลิเคชันระดับ production สำหรับร้านเครื่องดื่ม แบบครบวงจร รองรับ:

- Cost Calculation แบบเต็มสาย (Ingredient → Unit Conversion → Recipe → Menu → Variant/Modifier → Cost Snapshot ตอนขาย)
- POS ที่รองรับ Size/Topping/ความหวาน, ส่วนลด, VAT, ปัดเศษ, Void/Refund
- Inventory ที่ตรวจสอบย้อนกลับได้ 100% (append-only ledger)
- Recipe & Menu ที่คำนวณต้นทุนอัตโนมัติตลอดเวลา
- Sales & Reports ที่ตรงกับ ledger ต้นทางเสมอ
- Multi User (RBAC) พร้อม invite-only onboarding
- Future-ready: Multi Branch (schema พร้อมตั้งแต่ Phase 3)

รายละเอียดขอบเขต MVP vs อนาคต ดูที่ `PROJECT_SCOPE.md` — รายละเอียดการตัดสินใจเชิงลึกทุกจุด ดูที่ `DECISIONS.md`

---

## Tech Stack

| Layer          | Choice                                                                            |
| -------------- | --------------------------------------------------------------------------------- |
| Language       | TypeScript (strict mode)                                                          |
| Frontend       | Next.js 15 (App Router)                                                           |
| UI             | Tailwind CSS + shadcn/ui                                                          |
| Backend        | Supabase (Postgres + Auth)                                                        |
| ORM            | Prisma                                                                            |
| Auth           | Supabase Auth (Email/Password + Google OAuth, invite-only — ดู `DECISIONS.md` D6) |
| PDF Generation | Headless Chromium (Puppeteer/Playwright) — ดู `DECISIONS.md` D10                  |
| Deployment     | Vercel                                                                            |

เหตุผลการเลือกและวิธีจัดชั้นสถาปัตยกรรม ดูที่ `ARCHITECTURE.md` (โดยเฉพาะประเด็น Prisma ↔ Supabase RLS ใน `DECISIONS.md` D7)

---

## Development Strategy

```
Requirement → Decisions Check → Database → API → UI → Testing → Deployment
```

ห้ามข้ามขั้นตอนนี้ในทุก Feature — "Decisions Check" คือขั้นใหม่ที่เพิ่มเข้ามา เพื่อป้องกันการแก้ไขแบบวนลูป
(อ่านรายละเอียดเหตุผลใน `AGENTS.md` §3)

---

## Phase Roadmap

### Phase 0 — Project Initialization

**Goal**: สร้าง repository พร้อมเครื่องมือพื้นฐาน
**Tasks**:

- Next.js 15 project (App Router), TypeScript strict mode
- ESLint + Prettier (config กลางที่ root)
- Husky (pre-commit: lint + type-check, pre-push: test) + Commitlint
- shadcn/ui + Tailwind config (design token ตาม `UI_UX.md` §1)
- Prisma init + connection ไป Supabase (local/dev project)
- GitHub Actions CI skeleton (install → type-check → lint → test → build)
- โครงสร้างโฟลเดอร์ `/features/<feature-name>/` ตาม `CODING_STANDARD.md` §3
  **DoD**: Build ผ่าน, Lint ผ่าน, CI ผ่าน, `docs/` ทุกไฟล์ readable จาก repo root

### Phase 1 — Authentication & User Bootstrap

**Goal**: ผู้ใช้ล็อกอินได้ และมีกลไก bootstrap owner คนแรก
**Tasks**:

- Login, Logout, Forgot Password (Email/Password)
- Google OAuth login (ปฏิเสธถ้าไม่มี invite record ผูกอีเมล ยกเว้น bootstrap — ดู `DECISIONS.md` D6)
- **Bootstrap Owner**: signup คนแรกของระบบ (เมื่อยังไม่มี Owner) ได้ role Owner อัตโนมัติ
- **Invite flow**: Owner/Manager ส่ง invite (email + role) → ผู้ถูกเชิญตั้งรหัสผ่านผ่านลิงก์ (`user_invites` table)
- Session middleware + Route Protection (`(protected)` route group)
- Auth policy: session timeout 8 ชม., account lockout 5 ครั้ง/15 นาที, password ขั้นต่ำ 8 ตัวอักษร (ดู `DECISIONS.md` D13)
- Privacy Notice แสดงตอนรับ invite ครั้งแรก (PDPA — ดู `DECISIONS.md` D15)
- Self-Profile: ผู้ใช้ดู/แก้ไขชื่อ-อีเมลตนเองได้ (D15)
  **Acceptance Criteria**:
- ผู้ใช้ที่ไม่ล็อกอินเข้าหน้า dashboard ไม่ได้
- Signup คนแรกได้ Owner, signup คนถัดไปโดยไม่มี invite ถูกปฏิเสธ
- Login ผิด 5 ครั้งติด → ถูกล็อก 15 นาที

### Phase 2 — RBAC

**Tasks**:

- บทบาท Owner / Manager / **Shift Supervisor** / Cashier / Employee / **Accountant** ตาม RBAC matrix เต็มใน `SECURITY.md` §1 (ดู `DECISIONS.md` D14 — ⚠️ รอยืนยันจากผู้ใช้)
- Permission check กลาง (`requirePermission(role, action, resource)`) ที่ทุก Server Action/Route Handler เรียกเป็นบรรทัดแรก
- User Management UI: List ผู้ใช้, Invite (จำกัด role ที่เชิญได้ตามผู้เชิญ — Owner เชิญได้ทุก role, Manager เชิญได้เฉพาะ Shift Supervisor/Cashier/Employee — ดู `SECURITY.md` §1 หมายเหตุ), Deactivate
- Settings: `refund_approval_threshold` สำหรับ Shift Supervisor (D5, D14)
  **Acceptance Criteria**:
- ผู้ใช้ที่ไม่มีสิทธิ์เข้าหน้าที่ป้องกันไว้ไม่ได้ (ตรวจทั้ง UI และ Server Action) — ครบทั้ง 6 role
- Manager invite เป็น Owner/Manager/Accountant ไม่ได้ (ถูกปฏิเสธ)
- Accountant เข้า POS/Inventory/Settings ไม่ได้

### Phase 3 — Ingredient & Unit Conversion

**Tasks**:

- Ingredient CRUD, Search, Filter, Supplier link
- **Unit Conversion**: `base_unit` (gram/ml/piece), `purchase_unit`, `unit_conversions` table (ดู `DECISIONS.md` D2)
- `cost_per_unit` bootstrap แบบกรอกมือ (ก่อนมี PO จริงใน Phase 7 — ดู `DECISIONS.md` D1)
- Low stock threshold ต่อ ingredient (ใช้ต่อใน Phase 6)
  **Acceptance Criteria**:
- ระบบคำนวณ Price/Gram และ Price/ML อัตโนมัติจาก purchase price ÷ conversion factor
- เปลี่ยน purchase_unit → conversion factor อัปเดต cost_per_unit ทันที
  **หมายเหตุ**: เริ่มใส่คอลัมน์ `branch_id` ตั้งแต่ Phase นี้ (ดู `DATABASE.md` §2)

### Phase 4 — Recipe

**Tasks**: Recipe CRUD, Ingredient Selection (หน่วยอ้างอิง `base_unit` เสมอ), Quantity, Yield, Automatic Cost Calculation
**Acceptance Criteria**: Recipe cost อัปเดตอัตโนมัติเมื่อ ingredient cost เปลี่ยน (กลไก recalculation ดู `ARCHITECTURE.md` §3)

### Phase 5 — Menu, Variant & Modifier

**Tasks**:

- Menu CRUD, Categories, Price, Image, Recipe link, Availability
- **Menu Variant** (Size S/M/L): `recipe_multiplier` หรือ `override_recipe_id`, `price_delta` (ดู `DECISIONS.md` D3)
- **Modifier Group + Modifier** (Topping, ความหวาน, น้ำแข็ง): ผูก ingredient ได้ (กินสต็อก) หรือไม่ผูกก็ได้, `price_delta` ของตัวเอง
- Cost Preview UI แบบ real-time ต่อ variant (ดู `UI_UX.md` §2)
  **Acceptance Criteria**:
- Menu cost อ้างอิงจาก recipe เสมอ
- เปลี่ยน variant → cost preview เปลี่ยนตาม multiplier ทันที
- Modifier ที่ผูก ingredient → cost preview รวม ingredient cost นั้นด้วย

### Phase 6 — Inventory

**Tasks**:

- Stock In (ผูก PO), Stock Out (บังคับ reason code จากลิสต์ที่กำหนดไว้ล่วงหน้าสำหรับ Employee), Adjustment (จำกัด Manager/Owner เท่านั้น — ดู `DECISIONS.md` D12)
- Low Stock Alert banner
- `transfer` เป็น enum ที่เตรียมไว้ใน schema เท่านั้น **ไม่ implement UI/logic ใน MVP** (ดู `DECISIONS.md` D11)
- Reason code master list (จัดการใน Settings — Phase 12)
  **Acceptance Criteria**:
- สต็อกอัปเดตหลังการซื้อและการขายทุกครั้ง ผ่าน append-only ledger (ดู `ARCHITECTURE.md` §4)
- Employee ทำ adjustment อิสระไม่ได้ (ถูกปฏิเสธด้วย `FORBIDDEN`)
- Stock out ที่ไม่มี reason code (กรณีบังคับ) ถูกปฏิเสธด้วย `VALIDATION_ERROR`

### Phase 7 — Purchase

**Tasks**: Supplier CRUD, Purchase Order, Receive (trigger WAC recalculation — ดู `DECISIONS.md` D1), History
**Acceptance Criteria**:

- การรับสินค้าทำให้สต็อกเพิ่มขึ้น (หน่วยแปลงเป็น `base_unit` อัตโนมัติ)
- รับของ 2 ล็อตราคาต่างกัน → `cost_per_unit` เปลี่ยนเป็นค่าเฉลี่ยถ่วงน้ำหนักที่ถูกต้อง (มี unit test ยืนยัน)

### Phase 8 — POS

**Tasks**:

- Cart (รองรับเลือก Variant + Modifier ต่อรายการ), Payment (Cash/QR), Receipt
- **Discount**: ระดับรายการ + ระดับบิล (ไม่กระทบ cost snapshot — ดู `DECISIONS.md` D9)
- **VAT & Rounding**: snapshot vat_mode/vat_rate ณ เวลาขาย, ปัดเศษยอดรวมพร้อมบันทึก `rounding_adjustment` แยก
- **Stock Deficit Warning**: ขายต่อได้แม้สต็อกไม่พอ พร้อม flag `is_stock_deficit` (ดู `DECISIONS.md` D4)
- **Void** (ในกะเดียวกัน, Cashier ทำเองได้ พร้อม reason บังคับ) และ **Refund** (ข้ามกะ, Shift Supervisor อนุมัติได้เองถ้ายอด ≤ `refund_approval_threshold` มิฉะนั้นต้องผ่าน Manager/Owner) — ดู `DECISIONS.md` D5, D14
- Approval queue UI สำหรับ refund ที่รออนุมัติ (แยกคิวตามสิทธิ์ผู้อนุมัติ)
- **Tax Invoice**: ถ้า `is_vat_registered = true` ใบเสร็จต้องมีข้อมูลใบกำกับภาษีอย่างย่อครบ + เลขที่รันนิ่งนัมเบอร์ต่อเนื่อง (ดู `DECISIONS.md` D16)
  **Acceptance Criteria**:
- ขาย → ตัดสต็อก (รวม modifier ที่กินสต็อก) → คำนวณกำไร เกิดขึ้นอัตโนมัติในธุรกรรมเดียว (atomic transaction) พร้อม cost snapshot ณ เวลาขาย (รวม variant + modifier)
- Void ในกะสำเร็จ → สต็อกคืนทันที, ยอดขายลดทันที
- Refund ยอด ≤ threshold → Shift Supervisor approve ได้เองทันที; เกิน threshold → ต้องรอ Manager/Owner ไม่กระทบ ledger ก่อนได้รับอนุมัติ
- เลขที่ใบกำกับภาษีไม่ข้าม/ซ้ำ แม้มี void เกิดขึ้นระหว่างวัน

### Phase 9 — Expense

**Tasks**: Rent, Electricity, Salary, Misc, Expense Categories
**Acceptance Criteria**: ค่าใช้จ่ายกระทบ Report กำไร-ขาดทุนทันทีที่บันทึก และแก้ไข/ลบได้เฉพาะผ่านรายการปรับปรุง (ห้ามลบ record จริง)

### Phase 10 — Dashboard

**Widgets**: Today's Sales, Profit, Revenue, Best Seller, Low Stock, Expenses, Net Profit
**Tasks**: ทุก widget ที่ group ตาม "วัน" ต้องใช้ business day boundary (`business_day_start_hour` — ดู `DECISIONS.md` D8) ไม่ใช่ calendar day
**Acceptance Criteria**: Dashboard โหลดภายใน 2 วินาที, ยอดขายหลังเที่ยงคืนแต่ก่อน business_day_start_hour นับรวมในวันก่อนหน้าถูกต้อง

### Phase 11 — Reports

**Tasks**: Daily/Weekly/Monthly/Yearly, Top Menu, Profit, Inventory, CSV Export, **PDF Export ผ่าน headless Chromium** (ดู `DECISIONS.md` D10)
**Acceptance Criteria**: ตัวเลขในรายงานต้องตรงกับ ledger ต้นทาง 100% (traceable ย้อนกลับได้ทุกแถว รวมถึง void/refund/adjustment), PDF แสดงภาษาไทยถูกต้อง 100%

### Phase 12 — Settings

**Tasks**: Company, Tax (`vat_mode`, `vat_rate`), **Tax Invoice** (`is_vat_registered`, `tax_id`, `registered_name`, `registered_address` — D16), Receipt, Printer, Business Hours, **Timezone & Business Day Start Hour** (D8), **Stock Deficit Policy** (บล็อก/ไม่บล็อก ต่อ ingredient หรือ global — D4), Reason Code master list (D12), **Refund Approval Threshold** (D5, D14), Theme
**Acceptance Criteria**: การเปลี่ยน setting มีผลทันทีกับเอกสาร/ใบเสร็จที่ออกใหม่ แต่ไม่กระทบใบเสร็จเก่าที่ออกไปแล้ว (เพราะเป็น snapshot)

### Phase 13 — Testing

**Tasks**: Unit Test, Integration Test, E2E, Security, Performance — รวมถึง test ยืนยันทุก Decision ใน `DECISIONS.md` (ดู `TESTING.md` §3 concrete test cases ที่คำนวณจาก Reference Sample Dataset) + **UAT** โดย Owner/Cashier/Shift Supervisor ตัวจริงก่อน sign-off (D18)
**รายละเอียด**: ดู `TESTING.md`

### Phase 14 — Deployment

**Tasks**: Deploy, Backup, Monitoring, Logging, Chromium runtime สำหรับ PDF (D10), CI ต้อง apply Prisma migration + RLS migration คู่กันเสมอ (D7), **Data Retention ≥ 5 ปี** สำหรับ ledger tables (D17), **PDPA incident response plan** (แจ้ง PDPC ภายใน 72 ชม. — D15)
**รายละเอียด**: ดู `DEPLOYMENT.md`

### Phase 15 — Post-MVP Roadmap (ไม่ implement ตอนนี้ — เตรียมไว้เพื่อความชัดเจน)

รายการนี้ **ไม่ใช่งานที่ต้องทำ** แต่ระบุไว้เพื่อกันไม่ให้ scope MVP บวมโดยไม่ตั้งใจ (ดู `PROJECT_SCOPE.md` — Out of Scope):

- Multi-branch UI (schema พร้อมแล้ว) + Stock Transfer
- Offline-tolerant POS (ต้องตัดสินใจแยกกับ Owner ก่อน — ดู `PROJECT_SCOPE.md` Open Question)
- Partial refund ระดับรายการเดี่ยว
- ระบบบัญชีเต็มรูปแบบ / เชื่อมโปรแกรมบัญชีภายนอก
- Loyalty/CRM ลูกค้า
- Third-party delivery integration

---

## Global Rules

ทุก Feature ต้องมีครบ: Decisions Check, Database, API, Validation, UI, Permission, Testing, Documentation

ทุก Feature ต้องผ่าน **Maker-Checker gate** ก่อนถือว่าเสร็จและ merge ได้ (ดู `AGENTS.md` §9) โดย Checker ไล่ตรวจตาม
FR/NFR ID ที่เกี่ยวข้องใน `docs/REQUIREMENTS.md` — ห้าม Maker self-declare ว่าเสร็จเอง

## Folder Standard (ต่อ 1 Feature)

```
/features/<feature-name>/
  components/
  hooks/
  services/
  types/
  actions/
  schemas/
  validators/
  constants/
  utils/
  tests/
```

## Git Flow

`feature/` `bugfix/` `hotfix/` `release/` → `main`
ห้าม commit ตรงเข้า `main` เด็ดขาด

## Claude Code Rule

ดูรายละเอียดเต็มใน `AGENTS.md` — สรุป: อ่าน requirement → เช็ค `DECISIONS.md` → เช็ค `REQUIREMENTS.md` (FR/NFR) → เช็ค Reading Map (`AGENTS.md` §8) ตาม Phase → เช็ค database → เช็ค API → implement (Maker) → test → อัปเดตเอกสาร → ตรวจสอบ (Checker, `AGENTS.md` §9) ห้ามข้ามขั้นตอน
