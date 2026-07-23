# CODING_STANDARD.md — Drink Shop Management System (DSMS)

## 1. Language & Tooling

- TypeScript **strict mode** บังคับ ห้ามใช้ `any` โดยไม่มีเหตุผลระบุเป็นคอมเมนต์
- ESLint + Prettier: config กลางที่ root, ห้าม override ต่อ feature
- Husky: pre-commit รัน lint + type-check, pre-push รัน test
- Commitlint: บังคับ Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`)

## 2. Naming Convention

| ประเภท            | Convention                    | ตัวอย่าง                |
| ----------------- | ----------------------------- | ----------------------- |
| Component (React) | `PascalCase`                  | `RecipeCostPreview.tsx` |
| Hook              | `camelCase` ขึ้นต้นด้วย `use` | `useRecipeCost.ts`      |
| Server Action     | `camelCase` ขึ้นต้นด้วย verb  | `createRecipe.ts`       |
| Type/Interface    | `PascalCase`                  | `RecipeIngredient`      |
| ไฟล์ทั่วไป        | `kebab-case`                  | `recipe-list.tsx`       |
| Database column   | `snake_case`                  | ดู `DATABASE.md`        |

## 3. Folder Standard ต่อ Feature

```
/features/<feature-name>/
  components/
  hooks/
  services/      ← business logic (cost cascade, calculation)
  types/
  actions/       ← Server Actions
  schemas/       ← zod schemas
  validators/
  constants/
  utils/
  tests/
```

ห้ามใส่ business logic ใน `components/` โดยตรง — ต้องอยู่ใน `services/` เท่านั้น เพื่อให้ test ได้โดยไม่ต้อง render UI

## 4. Git Flow

- Branch: `feature/<ชื่อ>`, `bugfix/<ชื่อ>`, `hotfix/<ชื่อ>`, `release/<version>`
- ห้าม commit ตรงเข้า `main` เด็ดขาด — ทุกอย่างผ่าน Pull Request + CI ผ่านก่อน merge
- PR description ต้องมี Assumptions Log ถ้ามีการเดา (ดู `AGENTS.md` §2)

## 5. Comment & Documentation ในโค้ด

- Business logic ที่ซับซ้อน (เช่น cost cascade) ต้องมีคอมเมนต์อธิบาย "ทำไม" ไม่ใช่แค่ "ทำอะไร"
- ฟังก์ชันใน `services/` ที่กระทบเงิน/สต็อกต้องมี JSDoc ระบุ pre-condition/post-condition ชัดเจน
- ใช้คำศัพท์โดเมนตาม `docs/GLOSSARY.md` เท่านั้น (เช่น "reversal" ไม่ใช่ "cancel", "adjustment" ไม่ใช่ "correction") เพื่อให้ชื่อฟังก์ชัน/ตัวแปร/เอกสารสื่อความตรงกันทั้งระบบ
