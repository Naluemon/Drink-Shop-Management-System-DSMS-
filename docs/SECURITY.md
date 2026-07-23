# SECURITY.md — Drink Shop Management System (DSMS)

## 1. RBAC Matrix (ปรับปรุงตาม `DECISIONS.md` D4, D5, D6, D12, D14 — ⚠️ D6/D12/D14 รอยืนยันจากผู้ใช้)

> **คำชี้แจง**: Role ด้านล่างคือ**ระดับสิทธิ์ (permission tier)** ไม่ใช่ตำแหน่งงาน (job title) — ตำแหน่งจริงในร้าน
> (บาริสต้า, พนักงานเสิร์ฟ, พนักงานทำความสะอาด ฯลฯ) แต่ละคน map เข้า role ใดก็ได้ตามสิทธิ์ที่ควรได้รับ เช่น
> บาริสต้าที่ขายหน้าร้านด้วย → map เป็น Cashier, บาริสต้าที่ทำแค่เครื่องดื่มไม่แตะเงิน/ระบบ → map เป็น Employee
> (ดู `DECISIONS.md` D14)

| Module                                               | Owner          | Manager                                    | Shift Supervisor              | Cashier      | Employee | Accountant                |
| ---------------------------------------------------- | -------------- | ------------------------------------------ | ----------------------------- | ------------ | -------- | ------------------------- |
| Ingredient                                           | CRUD           | CRUD                                       | View                          | View         | View     | -                         |
| Recipe                                               | CRUD           | CRUD                                       | View                          | View         | -        | -                         |
| Menu (+ Variant/Modifier)                            | CRUD           | CRUD                                       | View                          | View         | -        | -                         |
| Inventory — Stock In (มี PO อ้างอิง)                 | CRUD           | CRUD                                       | Create                        | -            | Create   | -                         |
| Inventory — Stock Out (มี reason code จากลิสต์)      | CRUD           | CRUD                                       | Create                        | -            | Create   | -                         |
| Inventory — Adjustment (แก้อิสระ ไม่มีเอกสารอ้างอิง) | CRUD           | Create                                     | -                             | -            | -        | -                         |
| Purchase                                             | CRUD           | CRUD                                       | View                          | -            | -        | -                         |
| POS — Create Sale                                    | View           | View                                       | Create                        | Create       | -        | -                         |
| POS — Void (ในกะเดียวกัน)                            | CRUD           | CRUD                                       | Create                        | Create       | -        | -                         |
| POS — Refund (หลังปิดกะ)                             | CRUD (approve) | CRUD (approve)                             | Approve (≤ threshold — ดู D5) | Request only | -        | -                         |
| Expense                                              | CRUD           | Create/View                                | -                             | -            | -        | Create/View               |
| User Management — Invite/Role                        | CRUD           | Invite (Shift Supervisor/Cashier/Employee) | -                             | -            | -        | -                         |
| Dashboard                                            | View           | View                                       | View (เฉพาะกะตัวเอง)          | -            | -        | -                         |
| Reports                                              | View (ทั้งหมด) | View (เฉพาะที่ได้รับสิทธิ์)                | View (เฉพาะกะตัวเอง)          | -            | -        | View (เฉพาะรายงานการเงิน) |
| Settings                                             | CRUD           | -                                          | -                             | -            | -        | -                         |

matrix นี้ต้องตรงกับทั้ง Application-layer check และ RLS policy เสมอ (ดู `ARCHITECTURE.md` §2, `DECISIONS.md` D7)

**หมายเหตุสำคัญ**:

- Employee **และ** Shift Supervisor ห้ามทำ "adjustment" อิสระเด็ดขาด (ช่องโหว่ปกปิดของหาย) — ทำได้เฉพาะ stock in/out ที่มีเอกสาร/reason code อ้างอิง (ดู `DECISIONS.md` D12) แม้ Shift Supervisor จะเป็นหัวหน้าเวรก็ตาม
- Cashier "Request" refund ได้ แต่กดยืนยันเองไม่ได้ ต้องผ่าน Shift Supervisor (ถ้ายอดไม่เกิน threshold) หรือ Manager/Owner (ดู `DECISIONS.md` D5, D14)
- Manager invite ผู้ใช้ใหม่ได้เฉพาะ role Shift Supervisor/Cashier/Employee เท่านั้น ห้าม invite เป็น Owner/Manager/**Accountant** (Accountant เป็นบุคคลภายนอกที่เห็นข้อมูลการเงิน ต้องผ่าน Owner เท่านั้น — ดู `DECISIONS.md` D14)
- Accountant **ไม่มีสิทธิ์เข้า** POS, Inventory, Settings, User Management เด็ดขาด (least privilege เพราะมักเป็นบุคคล/สำนักงานบัญชีภายนอก)

## 2. Authentication

- Supabase Auth: Email/Password + Google OAuth
- Session ผูกกับ Next.js middleware สำหรับ route protection (Phase 1)
- Route ที่ต้อง login ทั้งหมดอยู่ใต้ `(protected)` route group
- **User Bootstrap & Invite-only** (ดู `DECISIONS.md` D6 — ⚠️ รอยืนยันจากผู้ใช้): ผู้ใช้คนแรกที่ signup สำเร็จเมื่อระบบยังไม่มี Owner จะได้ role Owner อัตโนมัติ (ครั้งเดียว) หลังจากนั้นห้าม public signup — ผู้ใช้ใหม่ทุกคนต้องถูก invite ผ่าน `user_invites` เท่านั้น รวมถึง Google OAuth login ที่ไม่มี invite record ผูกอีเมลไว้ต้องถูกปฏิเสธ

### Auth Policy ขั้นต่ำ (ดู `DECISIONS.md` D13 — ⚠️ รอยืนยันจากผู้ใช้)

| นโยบาย          | ค่าเริ่มต้น                                  |
| --------------- | -------------------------------------------- |
| Session timeout | 8 ชั่วโมง (อิงกะทำงาน)                       |
| Account lockout | ล็อก 15 นาที หลัง login ผิด 5 ครั้งติดต่อกัน |
| Password policy | ขั้นต่ำ 8 ตัวอักษร ผสมตัวเลข                 |

ค่าเหล่านี้ปรับได้ผ่าน Settings ภายหลัง ไม่ hardcode ตายตัวในโค้ด

## 3. Authorization Strategy (สรุปจาก ARCHITECTURE.md)

1. **ด่านหลัก — Application Layer**: ตรวจ role จาก session ก่อนทุก Server Action/Route Handler
2. **RLS (Postgres) — ชี้แจงบทบาทที่แท้จริง** (ดู `DECISIONS.md` D7 — ⚠️ รอยืนยันจากผู้ใช้): เนื่องจาก Prisma เชื่อมต่อด้วย connection สิทธิ์สูง ไม่ผูกกับ Supabase JWT, RLS **ไม่ทำงานกับ request ปกติของแอปเลย** มันป้องกันเฉพาะ "การเข้าถึง DB นอก path แอป" (เช่น Supabase Dashboard ตรง, credential รั่ว) — ไม่ใช่ด่านที่สองของทุก request ตามที่เคยเข้าใจ ห้ามออกแบบ feature ใดที่พึ่งพา RLS เป็นตัวป้องกัน authorization หลัก
3. ห้ามใช้ Supabase **service role key** ที่ client-side หรือใน route ที่ไม่จำเป็นเด็ดขาด — ใช้เฉพาะ server-side ที่ผ่านการตรวจสิทธิ์แล้วเท่านั้น

## 4. Secrets Management

**บทเรียนจากโปรเจกต์ก่อนหน้า**: environment secrets เคยรั่วผ่าน browser dev tools ตอนใช้ public preview
แนวทางป้องกันสำหรับ DSMS:

- Secret ทั้งหมด (service role key, database URL) เก็บใน **Supabase Secrets / Vercel Environment Variables** เท่านั้น
- ห้ามใส่ค่าที่เป็นความลับใน `NEXT_PUBLIC_*` env var เด็ดขาด — ตัวแปรกลุ่มนี้ถูกส่งไปที่ client เสมอ
- Preview deployment (Vercel) ต้องใช้ Supabase project แยกจาก production (หรืออย่างน้อย service role แยก) เพื่อจำกัดผลกระทบถ้ารั่ว

## 5. Audit Logging

- ทุกการกระทำที่กระทบเงิน/สต็อก ต้องบันทึกใน append-only ledger (ดู `DATABASE.md` §3) พร้อม `created_by`
- Login/Logout และการเปลี่ยนสิทธิ์ผู้ใช้ ต้อง log แยกต่างหาก (audit log สำหรับ security event)
- Void/Refund ต้องบันทึก `approved_by` แยกจาก `created_by` เสมอ เพื่อให้ตรวจสอบย้อนหลังได้ว่าใครขาย ใครอนุมัติคืน (ดู `DECISIONS.md` D5)

## 6. Input Security

- ทุก input validate ด้วย zod ก่อนเข้าสู่ database (ป้องกัน injection ทางอ้อมและ data corruption)
- Prisma parameterize query ให้อัตโนมัติอยู่แล้ว แต่ raw query (ถ้ามี) ต้องผ่าน review เป็นพิเศษ

## 7. PDPA Compliance (พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 — ดู `DECISIONS.md` D15)

ระบบเก็บข้อมูลส่วนบุคคลของพนักงาน (ชื่อ, อีเมล, ประวัติการล็อกอิน) จึงเข้าข่าย Data Controller ตาม PDPA ตั้งแต่วันแรกที่มีผู้ใช้ในระบบ:

- **ฐานทางกฎหมาย**: เก็บข้อมูลพนักงานภายใต้ "ความจำเป็นเพื่อปฏิบัติตามสัญญา" (มาตรา 24(3)) — ไม่ต้องขอ consent แยกทุกครั้ง แต่ต้องแสดง Privacy Notice ให้พนักงานทราบตอนรับ invite ครั้งแรก
- **Data Subject Rights ที่ต้องรองรับ**: ดูข้อมูลตนเอง, แก้ไขชื่อ/อีเมลตนเอง, ปิดการใช้งานบัญชีเมื่อพ้นสภาพพนักงาน (soft-delete — ข้อมูลที่ผูกกับธุรกรรม append-only ต้องคงไว้เพื่อ audit trail ตามกฎหมายบัญชี ไม่ใช่สิทธิ "ลบ" แบบเต็มรูป)
- **Data Minimization**: MVP ห้ามเก็บข้อมูลส่วนบุคคลลูกค้า (เบอร์โทร, วันเกิด ฯลฯ) เพราะไม่มี business need ในขอบเขตนี้ (ดู `PROJECT_SCOPE.md`)
- **Data Breach Response**: ถ้าข้อมูลรั่วไหลกระทบสิทธิผู้ใช้ ต้องแจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (PDPC) ภายใน 72 ชั่วโมง — ต้องมีแผน incident response ขั้นต่ำก่อน production (เชื่อมกับ `DEPLOYMENT.md` §5)

> สรุปหลักการทั่วไปเพื่อวางแนวทางระบบเท่านั้น ไม่ใช่คำแนะนำทางกฎหมายที่สมบูรณ์ — ต้องให้ที่ปรึกษากฎหมายตรวจสอบก่อน production จริง

## 8. Tax Invoice Compliance (ใบกำกับภาษีอย่างย่อ — ดู `DECISIONS.md` D16)

ถ้าร้านจดทะเบียนภาษีมูลค่าเพิ่ม ใบเสร็จที่ POS ออกต้องมีข้อมูลครบตามมาตรา 86/6 ประมวลรัษฎากร: คำว่า "ใบกำกับภาษีอย่างย่อ", ชื่อ/เลขผู้เสียภาษี 13 หลัก/ที่อยู่ผู้ประกอบการ, เลขที่ใบกำกับภาษีแบบรันนิ่งนัมเบอร์ต่อเนื่อง, วันที่ออก, รายการ, ยอดรวม VAT — รายละเอียด field ดู `DATABASE.md` §11 และ `REQUIREMENTS.md` §A12 (Phase 12 มี Settings toggle ควบคุมว่าร้านจด VAT หรือไม่)

> สรุปหลักการทั่วไปตามประมวลรัษฎากร ไม่ใช่คำแนะนำทางภาษีที่สมบูรณ์ — ควรตรวจสอบกับผู้ทำบัญชี/สรรพากรพื้นที่ตามประเภทการจดทะเบียนจริงของร้าน
