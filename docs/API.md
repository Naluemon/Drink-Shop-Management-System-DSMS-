# API.md — Drink Shop Management System (DSMS)

## 1. Convention หลัก

- **Server Actions** (Next.js) เป็นช่องทางหลักสำหรับ UI ภายในระบบ (form submit, mutation)
- **Route Handlers** (`/app/api/*`) ใช้เฉพาะเมื่อต้องเรียกจากภายนอก (webhook, third-party integration, mobile client ในอนาคต)

## 2. Response Shape (Route Handlers)

```ts
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string } }
```

ห้าม leak stack trace หรือ internal error message ไปยัง client — ดู `ARCHITECTURE.md` §7

## 3. Validation

- ทุก input (ทั้ง Server Action และ Route Handler) ต้องผ่าน **zod schema** ที่อยู่ใน `schemas/` ของแต่ละ feature ก่อนถึง service layer
- Validation error ต้อง map เป็นข้อความที่ผู้ใช้เข้าใจได้ (ภาษาไทย) ไม่ใช่ raw zod error

## 4. Authorization

ทุก Server Action/Route Handler ต้องเรียกฟังก์ชันตรวจสิทธิ์กลาง (เช่น `requirePermission(role, action, resource)`) เป็นบรรทัดแรกก่อนแตะ business logic ใด ๆ — ดู RBAC matrix ใน `SECURITY.md`

## 5. Versioning

- MVP ยังไม่ต้องมี API versioning (ใช้ภายในเท่านั้น)
- ถ้าเปิด public API ในอนาคต ให้ใช้ prefix `/api/v1/...`

## 6. Error Codes มาตรฐาน (เริ่มต้น)

| Code                    | ความหมาย                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `UNAUTHORIZED`          | ไม่ได้ล็อกอิน                                                                                      |
| `FORBIDDEN`             | ล็อกอินแล้วแต่ไม่มีสิทธิ์                                                                          |
| `VALIDATION_ERROR`      | input ไม่ผ่าน schema                                                                               |
| `NOT_FOUND`             | ไม่พบ resource                                                                                     |
| `CONFLICT`              | ข้อมูลขัดแย้งที่**บล็อก**การทำรายการ (เช่น ชื่อซ้ำ, การตั้งค่าขัดกัน)                              |
| `STOCK_DEFICIT_WARNING` | สต็อกไม่พอแต่ **ไม่บล็อก** การขาย — POS ต้องแสดง warning แล้วให้กดขายต่อได้ (ดู `DECISIONS.md` D4) |
| `APPROVAL_REQUIRED`     | ต้องการการอนุมัติจาก Manager/Owner ก่อนดำเนินการต่อ (เช่น refund หลังปิดกะ — ดู `DECISIONS.md` D5) |
| `INTERNAL_ERROR`        | ข้อผิดพลาดที่ไม่คาดคิด                                                                             |

## 7. Void/Refund Action Contract (ดู `DECISIONS.md` D5, D14)

- `voidSaleTransaction(id, reason)` — Cashier เรียกได้เฉพาะรายการในกะเดียวกันของตัวเอง ก่อน settlement เท่านั้น สร้าง reversal entry ทันที
- `requestRefund(id, reason)` — Cashier/ใครก็ตามสร้าง "คำขอ" ได้ แต่สถานะเป็น `pending_approval` จนกว่าจะมีการ `approveRefund(requestId)` โดย: Shift Supervisor (ถ้ายอด ≤ `refund_approval_threshold`) หรือ Manager/Owner (ทุกยอด รวมถึงยอดที่เกิน threshold) — เรียกแล้วสร้าง reversal entry จริงพร้อม `approved_by`
- ทั้งสอง action ต้องเป็น atomic transaction ที่ครอบคลุมทั้ง sales reversal และ inventory reversal พร้อมกัน (ดู `ARCHITECTURE.md` §7)
