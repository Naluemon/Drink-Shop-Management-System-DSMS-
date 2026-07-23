# Drink Shop Management System (DSMS)

ระบบจัดการร้านเครื่องดื่มแบบครบวงจร: ต้นทุนวัตถุดิบ → สูตร → เมนู → POS → สต็อก → กำไรจริง แบบอัตโนมัติและตรวจสอบได้

> **สถานะโปรเจกต์**: Planning — ยังไม่มีโค้ด มีเฉพาะเอกสารออกแบบในโฟลเดอร์ `docs/`
> อ่าน `AGENTS.md` ก่อนเริ่มงานพัฒนาทุกครั้ง (กฎการทำงานของ AI agent ที่ช่วยพัฒนาโปรเจกต์นี้)

## เริ่มอ่านจากตรงไหน

| ลำดับ | ไฟล์                                                         | อ่านเพื่ออะไร                                                                                                            |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1     | [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md)           | ปัญหาที่แก้ + กลุ่มผู้ใช้                                                                                                |
| 2     | [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md)             | ขอบเขต MVP vs อนาคต + Open Question ที่ยังไม่ตัดสิน                                                                      |
| 3     | [`docs/DECISIONS.md`](docs/DECISIONS.md)                     | **การตัดสินใจทั้งหมดที่เคยเป็นช่องว่าง** — อ่านก่อนถามคำถามซ้ำ                                                           |
| 4     | [`docs/GLOSSARY.md`](docs/GLOSSARY.md)                       | นิยามคำศัพท์โดเมนที่ใช้ซ้ำทั่วเอกสาร                                                                                     |
| 5     | [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)               | **Functional + Non-Functional Requirements แบบละเอียด (FR/NFR ID)** ใช้เป็น checklist ตอนทำ (Maker) และตอนตรวจ (Checker) |
| 6     | [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) | Master Plan ทุก Phase                                                                                                    |
| 7     | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)               | Layering, Cost Cascade, Immutable Ledger                                                                                 |
| 8     | [`docs/DATABASE.md`](docs/DATABASE.md)                       | หลักการ schema (ยังไม่ใช่ ERD เต็ม)                                                                                      |
| 9     | [`docs/API.md`](docs/API.md)                                 | Convention ของ Server Action/Route Handler                                                                               |
| 10    | [`docs/SECURITY.md`](docs/SECURITY.md)                       | RBAC matrix, Auth policy                                                                                                 |
| 11    | [`docs/UI_UX.md`](docs/UI_UX.md)                             | Design system, หน้าจอหลักต่อ Phase                                                                                       |
| 12    | [`docs/CODING_STANDARD.md`](docs/CODING_STANDARD.md)         | Naming, Folder standard, Git flow                                                                                        |
| 13    | [`docs/TESTING.md`](docs/TESTING.md)                         | Test stack, coverage guideline                                                                                           |
| 14    | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                   | Environment, CI/CD, Backup                                                                                               |

## วิธีรันโปรเจกต์ (Local Development)

1. **เตรียม Environment Variables**
   ก๊อปปี้ไฟล์ `.env.example` ไปเป็น `.env` และกรอกข้อมูลให้ครบถ้วน:

   ```bash
   cp .env.example .env
   ```

   (โดยเฉพาะ `DATABASE_URL` และค่าคอนฟิกของ Supabase)

2. **ติดตั้ง Dependencies**

   ```bash
   npm install
   ```

3. **เตรียมฐานข้อมูล (Prisma)**
   สร้าง schema และ migrate ฐานข้อมูล:

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. **รัน Development Server**
   ```bash
   npm run dev
   ```
   เปิดเบราว์เซอร์ไปที่ `http://localhost:3000`

## Tech Stack

Next.js 15 (App Router) + TypeScript strict · Tailwind CSS + shadcn/ui · Prisma → Supabase (Postgres + Auth) · Vercel

รายละเอียดเต็มดู `docs/IMPLEMENTATION_PLAN.md`

## กฎสำคัญที่ต้องรู้ก่อนแก้โค้ด/เอกสาร

- ห้ามเปิดประเด็นซ้ำที่ตอบไปแล้วใน `docs/DECISIONS.md` — ถ้าตัดสินใจใหม่ ต้องเพิ่มเข้าไปในไฟล์นั้นตามฟอร์แมตเดิม
- ตารางธุรกรรมการเงิน/สต็อก (`sales_transactions`, `inventory_movements`, `expense_entries`) เป็น **append-only** ห้าม UPDATE/DELETE
- ทุกตารางธุรกิจมีคอลัมน์ `branch_id` ตั้งแต่ Phase 3 แม้ MVP รองรับสาขาเดียว
- Authorization ตรวจที่ Application Layer เป็นด่านเดียวที่พึ่งพาได้จริง — RLS ไม่ใช่ด่านที่สองของ request ปกติ (ดู `docs/DECISIONS.md` D7)
- ก่อนเริ่ม Phase/Module ใด ให้เช็ค **Reading Map** ใน `AGENTS.md` §8 ว่าต้องอ่านไฟล์ไหนก่อน
- ทุก Feature ต้องผ่าน **Maker-Checker gate** (`AGENTS.md` §9) — Maker implement, Checker (คนละ session) ไล่ตรวจตาม FR/NFR ใน `docs/REQUIREMENTS.md` ก่อนถือว่าเสร็จ
