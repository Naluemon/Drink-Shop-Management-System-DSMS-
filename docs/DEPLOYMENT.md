# DEPLOYMENT.md — Drink Shop Management System (DSMS)

## 1. Environment

| Environment | ใช้สำหรับ                                                                                |
| ----------- | ---------------------------------------------------------------------------------------- |
| Local       | Dev เครื่องตัวเอง (Supabase local หรือ dev project)                                      |
| Preview     | Vercel preview ต่อ PR — ต้องใช้ Supabase project แยกจาก production (ดู `SECURITY.md` §4) |
| Production  | Vercel production + Supabase production project                                          |

## 2. CI/CD (GitHub Actions)

Pipeline ต้องผ่านทุกขั้นก่อน merge เข้า `main`:

1. Install + Type-check
2. Lint
3. Unit/Integration test
4. Prisma migration (รวม RLS policy migration — ต้อง apply คู่กันเสมอ ดู `DECISIONS.md` D7) dry-run/validate
5. Build

Merge เข้า `main` = auto-deploy ไป production (หลัง Phase 14 ตั้งค่าเสร็จ)

## 2.1 PDF Generation Runtime (ดู `DECISIONS.md` D10)

- ใช้ headless Chromium (Puppeteer/Playwright) สำหรับ render ใบเสร็จ/รายงานเป็น PDF เพื่อรองรับฟอนต์ไทยถูกต้อง
- Vercel serverless ต้องใช้ Chromium binary ที่ compatible กับ serverless (เช่น `@sparticuz/chromium`) — ต้อง benchmark cold-start time ก่อนเข้า Phase 11 จริง ถ้าช้าเกิน 2-3 วินาที ให้พิจารณาแยกเป็น queue/microservice แทนการ render ใน request เดียวกัน

## 3. Secrets & Environment Variables

- จัดการผ่าน Vercel Environment Variables + Supabase Secrets เท่านั้น
- แยก secret ระหว่าง Preview และ Production เด็ดขาด — ห้ามใช้ production service role key ใน preview environment

## 4. Backup Strategy & Data Retention

- Supabase automated daily backup (ตาม plan ที่ใช้)
- Export manual (pg_dump) ก่อนทำ migration ที่มีความเสี่ยงสูง (breaking schema change)
- **Data Retention (ดู `DECISIONS.md` D17)**: ตาราง `sales_transactions`, `inventory_movements`, `expense_entries` และเอกสารอ้างอิง ต้องเก็บไว้อย่างน้อย **5 ปี** ตาม พ.ร.บ.การบัญชี พ.ศ. 2543 มาตรา 14 — ห้ามมี job/policy ใดลบหรือ purge ข้อมูลกลุ่มนี้อัตโนมัติภายในระยะเวลาดังกล่าว ถ้าต้องลดขนาด database ให้ archive ไปเก็บที่อื่น ไม่ใช่ลบทิ้ง

## 5. Monitoring & Logging

- Vercel Analytics/Logs สำหรับ frontend/server errors
- Supabase Logs สำหรับ database query/error
- แนะนำเพิ่ม error tracking (เช่น Sentry) ก่อนเข้าสู่ Phase 8 (POS) เพราะเป็นจุดที่กระทบเงินโดยตรง — ตัดสินใจตอน Phase 13-14
- **PDPA Data Breach Response** (ดู `DECISIONS.md` D15, `SECURITY.md` §7): ต้องมีแผน incident response ขั้นต่ำที่ระบุผู้รับผิดชอบแจ้ง PDPC ภายใน 72 ชั่วโมงหากเกิดเหตุข้อมูลรั่วไหลที่กระทบสิทธิผู้ใช้

## 6. Rollback Plan

- Vercel: rollback ไป deployment ก่อนหน้าได้ทันทีจาก dashboard
- Database migration: ทุก migration ต้องเขียนคู่กับ down-migration หรือมีแผน rollback ที่ทดสอบแล้วก่อน apply บน production
