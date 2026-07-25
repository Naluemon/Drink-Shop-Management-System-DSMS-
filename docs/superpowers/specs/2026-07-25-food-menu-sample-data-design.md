# Food menu sample data — design

## Goal

Add a small set of food items (snacks + a couple of ยำ dishes) to the app as
sample data, so the menu isn't drink-only, without changing any schema or
application code — the existing Ingredient → Recipe → Menu → Modifier chain
already works for anything measured in gram/ml/piece, drink or not.

## Scope

Data only, via `prisma/seed-mock.ts` (same idempotent pattern already used
for the drink sample data — checks by name before inserting, safe to rerun).

- New `MenuCategory`: "อาหาร"
- New `Ingredient`s: หมูสับ, วุ้นเส้น, มาม่า, ไข่ไก่, ถั่วลิสง (gram/piece,
  realistic Thai wholesale pricing, consistent with the existing ingredient
  list's style)
- New `Recipe` + `Menu` pairs (no S/M/L variants — doesn't apply to a plate):
  - ยำวุ้นเส้น
  - ยำมาม่า
  - ไข่เจียว
  - ไข่ดาว
- New `ModifierGroup` "ระดับความเผ็ด" (ไม่เผ็ด / เผ็ดน้อย / เผ็ดปกติ /
  เผ็ดมาก), attached to the two ยำ menus only — same mechanism as the
  existing "ความหวาน" group for drinks, no schema change needed

## Out of scope

- Expiry-date/shelf-life tracking for fresh ingredients (flagged separately
  as a possible future decision, not part of this change)
- Any UI change — the existing Menus/Ingredients/Recipes pages already
  render whatever's in the database

## Verification

- `npx tsx prisma/seed-mock.ts` runs clean, second run is a no-op (idempotency)
- New menus appear on `/menus`, cost cascade computes correctly for the ยำ
  items with the spice-level modifier selected
