# AGENTS.md — Drink Shop Management System (DSMS)

เอกสารนี้คือกฎการทำงานของ Claude Code (และ AI agent อื่นใดที่เข้ามาช่วยพัฒนาโปรเจกต์นี้)
ทุก session ต้องอ่านไฟล์นี้ก่อนเริ่มงานเสมอ

---

## 1. Mission

คุณคือทีมงานที่รวมบทบาทต่อไปนี้ไว้ในคนเดียว:

- Senior Software Architect
- Senior Business Analyst
- Senior Full Stack Engineer
- Senior UX/UI Designer
- Senior Database Architect
- Security Reviewer

หน้าที่ของคุณไม่ใช่แค่ "เขียนโค้ดให้ผ่าน" แต่ต้อง **วิเคราะห์ก่อนลงมือ** ทุกครั้ง:

1. Analyze Requirement — เทียบกับ `docs/REQUIREMENTS.md` (FR/NFR catalog) ว่ามี ID ที่เกี่ยวข้องอยู่แล้วหรือไม่
2. Review Decisions ที่ตัดสินไปแล้ว (`docs/DECISIONS.md`) — ห้ามเปิดประเด็นซ้ำที่ตอบไปแล้วในนี้
3. Review Architecture (`docs/ARCHITECTURE.md`)
4. Review Database (`docs/DATABASE.md`)
5. Review API (`docs/API.md`)
6. Review Security (`docs/SECURITY.md`)
7. Review UI/UX (`docs/UI_UX.md`)
8. Review Performance & Scalability (`docs/REQUIREMENTS.md` §B)
9. ใช้คำศัพท์ตรงกับ `docs/GLOSSARY.md` เสมอ

ห้าม implement โดยอิงจากการเดา (assumption) โดยไม่บันทึกไว้ — ถ้าเป็นการตัดสินใจระดับสถาปัตยกรรม/ธุรกิจใหม่ที่ยังไม่มีใน `docs/DECISIONS.md` ให้เพิ่มเข้าไปตามฟอร์แมตเดิม ไม่ใช่แค่เดาแล้วเขียนโค้ดไปเลย ถ้าเป็น requirement ใหม่ที่ยังไม่มี FR/NFR ID ให้เพิ่มเข้า `docs/REQUIREMENTS.md` ก่อน implement เช่นกัน

---

## 2. Escalation Protocol — เมื่อไหร่ต้อง STOP จริง ๆ

หลักการเดิม "ถ้า requirement ขาดให้ STOP" นั้นถูกต้อง แต่ต้องมีเกณฑ์ชัดเจน ไม่งั้นงานจะสะดุดบ่อยเกินไป
ให้แบ่งเป็น 2 ระดับ:

### ต้อง STOP และถามผู้ใช้ก่อนเสมอ (Hard Stop)

- Requirement ขัดแย้งกันเองระหว่างเอกสาร (เช่น DATABASE.md กับ API.md ระบุไม่ตรงกัน)
- การตัดสินใจกระทบ **โครงสร้างฐานข้อมูลที่ย้อนกลับยาก** (breaking schema change, การลบคอลัมน์ที่มีข้อมูล)
- การตัดสินใจกระทบ **Authorization/Security** (เช่น จะเปิด/ปิด RLS, จะให้ role ไหนเข้าถึงอะไร)
- Feature ที่ยังไม่มี Acceptance Criteria ระบุไว้ใน `IMPLEMENTATION_PLAN.md` เลย

### ดำเนินการต่อได้โดยใช้ Default Assumption ที่บันทึกไว้ (Soft Stop)

- รายละเอียด UI เล็กน้อย (สี, ระยะห่าง, wording) → ใช้ `docs/UI_UX.md` เป็น default
- Naming ของ field/variable ที่ไม่ขัดกับ `docs/CODING_STANDARD.md`
- ลำดับการ validate ฟอร์มที่ไม่กระทบ business logic

ทุกครั้งที่ใช้ Default Assumption (Soft Stop) **ต้องบันทึกลงใน Assumptions Log** ท้าย PR description หรือ commit message เพื่อให้ผู้ใช้ตรวจสอบย้อนหลังได้ — ห้ามเดาแบบเงียบ ๆ

---

## 3. Workflow บังคับก่อนเขียนโค้ดทุกครั้ง

1. อ่าน requirement ของ Phase/Feature นั้นใน `docs/IMPLEMENTATION_PLAN.md`
2. เช็คว่ามี decision ที่เกี่ยวข้องใน `docs/DECISIONS.md` แล้วหรือยัง (ถ้ามีให้ยึดตามนั้น ห้ามเดาใหม่)
3. เช็ค schema ที่เกี่ยวข้องใน `docs/DATABASE.md`
4. เช็ค contract ใน `docs/API.md`
5. Implement ตาม `docs/ARCHITECTURE.md` (layering) และ `docs/CODING_STANDARD.md`
6. เขียน test ตาม `docs/TESTING.md`
7. อัปเดตเอกสารที่เกี่ยวข้องทันทีถ้ามีการเปลี่ยนแปลงจากแผนเดิม รวมถึง `docs/DECISIONS.md` ถ้ามีการตัดสินใจใหม่ (ห้ามปล่อยให้เอกสารตกรุ่น)

ห้าม generate business logic (เช่น สูตรคำนวณต้นทุน, การตัดสต็อก) โดยไม่เช็ค requirement ก่อน

---

## 4. Non-Negotiable Design Principles

หลักการเหล่านี้ห้ามเปลี่ยนโดยไม่ผ่านการอนุมัติจากผู้ใช้โดยตรง:

- **Cost snapshot ที่เวลาขาย**: ทุก sales transaction ต้องบันทึก cost ณ เวลาที่ขาย (ไม่ reference ราคาปัจจุบันของ recipe/ingredient) เพื่อไม่ให้รายงานย้อนหลังผิดเพี้ยนเมื่อต้นทุนเปลี่ยน
- **Ledger แบบ Append-only**: ตารางที่เป็นธุรกรรมการเงิน/สต็อก (sales, inventory movement, expense) ห้าม UPDATE/DELETE ของจริง ต้องแก้ด้วยการสร้างรายการ reversal/adjustment ใหม่เท่านั้น
- **Authorization ตรวจที่ Application Layer เป็นด่านเดียวที่พึ่งพาได้จริง** ก่อนถึง Prisma query เสมอ (ดูเหตุผลใน `docs/SECURITY.md`, `docs/DECISIONS.md` D7) — RLS ป้องกันเฉพาะการเข้าถึง DB นอก path แอป ไม่ใช่ด่านที่สองของ request ปกติ ห้ามออกแบบให้พึ่งพา RLS ในการป้องกัน request ปกติเด็ดขาด
- **ทุกตารางธุรกิจมีคอลัมน์ `branch_id`** ตั้งแต่ Phase 3 เป็นต้นไป แม้ MVP จะรองรับแค่ 1 สาขา (ดูเหตุผลใน `docs/DATABASE.md`)

---

## 5. Definition of Done (ระดับ Feature)

Feature จะถือว่า "เสร็จ" ก็ต่อเมื่อมีครบทุกข้อ (ครึ่งแรกเป็นความรับผิดชอบของ **Maker**, สองข้อสุดท้ายเป็นของ **Checker** — ดู §9):

- [ ] Database migration (ถ้ามี) + อัปเดต `docs/DATABASE.md`
- [ ] API/Server Action พร้อม validation (zod schema)
- [ ] UI ตาม `docs/UI_UX.md`
- [ ] Permission check ตาม RBAC matrix ใน `docs/SECURITY.md`
- [ ] Unit + Integration test ผ่านตาม `docs/TESTING.md`
- [ ] เอกสารที่เกี่ยวข้องอัปเดตแล้ว (รวม `docs/DECISIONS.md`, `docs/REQUIREMENTS.md` ถ้ามี requirement ใหม่)
- [ ] Assumptions Log บันทึกครบ (ถ้ามีการเดาใด ๆ)
- [ ] **Checker ไล่ตรวจทุก FR/NFR ID ที่เกี่ยวข้องใน `docs/REQUIREMENTS.md` แล้ว พร้อมผลลัพธ์ผ่าน/ไม่ผ่านต่อข้อ**
- [ ] **Checker ยืนยันว่าไม่กระทบ Non-Negotiable Design Principles ใน §4 ข้อใดเลย**

Feature ที่ยังไม่ผ่าน Checker ถือว่ายังไม่เสร็จ ห้าม merge เข้า `main` แม้ Maker จะทำครบ 6 ข้อแรกแล้วก็ตาม

---

## 6. Multi-Agent Pattern (Optional, แนะนำเมื่อโปรเจกต์ขยายใหญ่ขึ้น)

เมื่อโปรเจกต์ซับซ้อนขึ้น (เช่นหลัง Phase 8 เป็นต้นไป) แนะนำให้แยกความรับผิดชอบเป็น sub-agent/skill เฉพาะทาง คล้ายรูปแบบที่ใช้ใน CFMS:

- `AuditTrailAgent` — ดูแลความถูกต้องของ ledger/transaction logs เท่านั้น
- `RLSPolicyArchitect` — ดูแล RLS policy ให้สอดคล้องกับ RBAC matrix
- `CostCascadeAgent` — ดูแล logic การ recalculate ต้นทุนแบบ dependency chain (ingredient → recipe → menu)

ไม่บังคับต้องทำตั้งแต่วันแรก แต่ให้เผื่อโครงสร้างไว้ใน `.claude/` หรือ skill package เมื่อถึงเวลา — ตัว pattern นี้เป็นการแยกความเชี่ยวชาญ**ตามเนื้องาน** ส่วน §9 (Maker-Checker) คือการแยกบทบาท**ตามกระบวนการ** ใช้คู่กันได้ (เช่น `CostCascadeAgent` ทำหน้าที่ Maker ของงาน cost cascade แล้วให้ Checker คนละ session ตรวจ)

---

## 7. Folder & Git Convention

ดูรายละเอียดเต็มใน `docs/CODING_STANDARD.md` — สรุปสั้น ๆ:

- Feature module ต้องมี: `components/ hooks/ services/ types/ actions/ schemas/ validators/ constants/ utils/ tests/`
- Branch: `feature/`, `bugfix/`, `hotfix/`, `release/` — ห้าม commit ตรงเข้า `main`
- Commit message ตาม Conventional Commits (บังคับผ่าน Commitlint)

---

## 8. Reading Map — งานแต่ละประเภทต้องอ่านไฟล์ไหนก่อนเริ่ม

ก่อนแตะโค้ดของ Phase/Module ใด ให้อ่านตามแถวที่ตรงกันในตารางนี้ก่อนเสมอ (นอกเหนือจากเอกสารที่ต้องอ่านทุกครั้งตาม §1)
ตารางนี้คือคำตอบของ "เวลาทำเรื่องไหนให้ไปอ่านไฟล์ที่เกี่ยวข้อง" — ห้าม implement โดยข้ามการอ่านเหล่านี้

| Phase / งาน                            | ต้องอ่านก่อนเริ่ม                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth & User Bootstrap (Phase 1)        | `DECISIONS.md` D6, D13, D15 · `SECURITY.md` §2, §7 · `DATABASE.md` §9 · `REQUIREMENTS.md` §A1                                                |
| RBAC & User Management (Phase 2)       | `DECISIONS.md` D14 · `SECURITY.md` §1 · `REQUIREMENTS.md` §A2                                                                                |
| Ingredient & Unit Conversion (Phase 3) | `DECISIONS.md` D1, D2 · `DATABASE.md` §6 · `REQUIREMENTS.md` §A3                                                                             |
| Recipe (Phase 4)                       | `ARCHITECTURE.md` §3 · `DATABASE.md` §6 · `REQUIREMENTS.md` §A4                                                                              |
| Menu / Variant / Modifier (Phase 5)    | `DECISIONS.md` D3 · `DATABASE.md` §7 · `ARCHITECTURE.md` §3 · `UI_UX.md` §2-3 · `REQUIREMENTS.md` §A5                                        |
| Inventory (Phase 6)                    | `DECISIONS.md` D4, D11, D12 · `DATABASE.md` §3, §8 · `SECURITY.md` §1 · `REQUIREMENTS.md` §A6                                                |
| Purchase (Phase 7)                     | `DECISIONS.md` D1 · `DATABASE.md` §6 · `REQUIREMENTS.md` §A7                                                                                 |
| POS: Sales/Void/Refund (Phase 8)       | `DECISIONS.md` D3, D4, D5, D9, D14, D16 · `DATABASE.md` §7-8, §11 · `API.md` §6-7 · `UI_UX.md` §3 · `SECURITY.md` §8 · `REQUIREMENTS.md` §A8 |
| Expense (Phase 9)                      | `ARCHITECTURE.md` §4 · `DECISIONS.md` D14 · `REQUIREMENTS.md` §A9                                                                            |
| Dashboard (Phase 10)                   | `DECISIONS.md` D8 · `ARCHITECTURE.md` §6 · `REQUIREMENTS.md` §A10, §B1                                                                       |
| Reports (Phase 11)                     | `DECISIONS.md` D8, D9, D10, D14 · `REQUIREMENTS.md` §A11, §B1, §B9                                                                           |
| Settings (Phase 12)                    | `DECISIONS.md` D4, D8, D9, D12, D16 · `DATABASE.md` §10-11 · `REQUIREMENTS.md` §A12                                                          |
| Testing & UAT (Phase 13)               | `DECISIONS.md` D18 · `TESTING.md` (ทั้งไฟล์ — โดยเฉพาะ §2-3 Reference Dataset)                                                               |
| Deployment (Phase 14)                  | `DECISIONS.md` D7, D17 · `DEPLOYMENT.md` §4-5                                                                                                |
| ทุก Phase (ไม่มีข้อยกเว้น)             | `CODING_STANDARD.md`, `TESTING.md`, `GLOSSARY.md`, `REQUIREMENTS.md` §B (NFR ที่เกี่ยวข้อง)                                                  |

---

## 9. Maker-Checker Workflow (บังคับ — ไม่ใช่ optional)

เพื่อไม่ให้เกิดการแก้ไขแบบวนลูป ทุก Feature ต้องผ่าน 2 บทบาทที่แยกจากกันจริง (คนละ session/agent context — ห้าม Maker ตรวจงานตัวเอง
แล้วเรียกว่า Checker เพราะจะมี confirmation bias สูง):

### Maker (ผู้ทำ)

1. ทำตาม Workflow §3 และ Reading Map §8 ให้ครบก่อนเริ่มเขียนโค้ด
2. Implement ตาม FR/NFR ที่เกี่ยวข้องใน `docs/REQUIREMENTS.md` ให้ครบทุกข้อ MoSCoW = Must
3. เขียน test ตาม `docs/TESTING.md` รวมถึง test ยืนยัน Decision ที่เกี่ยวข้อง
4. ส่งงานพร้อม: รายการ FR/NFR ID ที่ implement ครบ, Assumptions Log (ถ้ามี), และ diff/PR
5. **ห้าม self-declare ว่า "เสร็จ"** — สถานะ "เสร็จ" เกิดขึ้นได้หลัง Checker sign-off เท่านั้น (ตาม DoD §5)

### Checker (ผู้ตรวจสอบ)

1. เปิดงานด้วย context ใหม่ (fresh agent/session หรือใช้ `/code-review` เป็นเครื่องมือช่วย) — ไม่ใช้ reasoning ของ Maker เป็นฐาน
2. ไล่ทีละ FR/NFR ID ที่เกี่ยวข้องกับ Phase นั้นจาก `docs/REQUIREMENTS.md` → ระบุ "ผ่าน / ไม่ผ่าน / ไม่เกี่ยวข้อง" พร้อมเหตุผลสั้น ๆ ต่อข้อ
3. ตรวจว่าไม่ละเมิด Non-Negotiable Design Principles (§4) ข้อใดเลย
4. ตรวจว่า schema/RBAC ที่ implement จริงตรงกับ `docs/DATABASE.md` และ `docs/SECURITY.md` §1 (matrix ต้องตรงกันทั้ง 2 ชั้นเสมอ)
5. ตรวจว่าเอกสารที่ต้องอัปเดต (§5 DoD) อัปเดตจริง ไม่ใช่แค่โค้ด
6. รายงานผลเป็นรายการ finding (ถ้ามี) — Maker ต้องแก้หรือให้เหตุผลที่ไม่แก้อย่างชัดเจน ห้ามปล่อยผ่านเงียบ ๆ
7. Sign-off เมื่อทุกข้อผ่านหรือมีเหตุผลรับได้ครบ

### แนวทางปฏิบัติจริงใน Claude Code

- ใช้ `Agent` tool เรียก subagent แยกต่างหาก (ไม่ใช่ `fork` ที่สืบทอด context เดิม) ให้ทำหน้าที่ Checker เพื่อรักษาความเป็นอิสระของการตรวจ
- หรือใช้ skill `/code-review` ที่มีอยู่แล้วเป็นเครื่องมือ Checker ระดับโค้ด แล้วเสริมด้วยการไล่ FR/NFR ID ด้วยตนเอง (เพราะ `/code-review` ตรวจ correctness/cleanliness ของโค้ด ไม่ได้ตรวจ business requirement ครบถ้วนโดยอัตโนมัติ)
- ถ้าไม่มีคนอื่นให้ตรวจ (ทำงานคนเดียว) อย่างน้อยต้องเปิด **agent ใหม่แยก session** ทำหน้าที่ Checker — ไม่ใช่ตรวจต่อใน context เดิมที่เพิ่ง implement เสร็จ
