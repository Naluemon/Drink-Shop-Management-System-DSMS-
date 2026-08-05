# Audit log / activity history — design

## Problem

There's no way to answer "who changed this, and what did it look like before?" for
anything in DSMS. Every mutable table has `createdBy`/`updatedBy`/`updatedAt`, but
each update overwrites the previous values — there's no trail, and no record of
_what specifically_ changed. The owner wants a system-wide "History" page: who
added/edited/deleted what, when, and (for edits) old value → new value per field.

## Scope

Everything, including POS sales (confirmed with the user — not just master data).
Concretely, every mutating server action across:

- Ingredients (create/update/soft-delete, unit conversions, opened/cleared)
- Menu categories, menus (create/update/soft-delete, variants, modifier-group links)
- Modifier groups + modifiers
- Recipes (create/update/soft-delete, recipe ingredients)
- Suppliers (create/update/soft-delete)
- Users (invite, role change, deactivate/reactivate)
- Purchase orders (create, status changes, receive)
- Inventory (stock in/out, adjustments)
- POS (checkout/sale creation, void, refund)
- Expenses (create/update/delete)
- Company settings changes

Access: **Owner only**, permanently — not something a Manager can be granted via
the existing configurable role/page-permission grid (same pattern already used
for "settings").

## Data model

One new table, generic enough for every entity type above:

```prisma
model AuditLog {
  id         String      @id @default(uuid())
  branchId   String      @map("branch_id")
  actorId    String      @map("actor_id")
  actorName  String      @map("actor_name")   // snapshot — survives the user later being deleted/renamed
  action     AuditAction
  entityType String      @map("entity_type")  // "ingredient" | "menu" | "sale" | ...
  entityId   String      @map("entity_id")
  entityName String      @map("entity_name")  // human label, e.g. ingredient name / receipt no. — avoids a join to render the list
  changes    Json?                             // [{ field, oldValue, newValue }, ...]
  createdAt  DateTime    @default(now()) @map("created_at")

  actor User @relation(fields: [actorId], references: [id])

  @@index([branchId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}

enum AuditAction {
  created
  updated
  deleted
}
```

- `created`: `changes` holds the initial field values (`oldValue: null`, `newValue: X`).
- `updated`: `changes` holds only the fields that actually changed.
- `deleted`: `changes` is `null` (soft-delete has no field-level diff worth showing).
- POS sales: `action: created`, `entityType: "sale"`, `entityName` = receipt/order
  number, `changes` = a summary snapshot (items, quantities, total) rather than a
  field diff.

## Capture approach

**Explicit logging calls**, not a Prisma extension/middleware that auto-diffs
every write. Add `lib/audit-log.ts` exporting `recordAuditLog(tx, { actorId,
actorName, branchId, action, entityType, entityId, entityName, changes })`, a
thin insert. Each existing mutating server action calls it explicitly, inline
with the mutation.

Rationale: this matches how the codebase already works everywhere — explicit
`getActor()` + `requirePermission()` per action, no hidden cross-cutting
machinery. A Prisma Client Extension could auto-capture every write, but needs
`AsyncLocalStorage` to know the actor (extensions don't see request context) and
a pre-read to diff on every write — new architecture this codebase doesn't use
anywhere, for a feature whose whole point is being trustworthy and easy to audit
itself.

**Atomicity**: wherever the underlying action doesn't already run inside
`prisma.$transaction`, wrap the mutation and the `recordAuditLog` insert
together in one. A change must never happen without a log entry, or vice versa —
that would defeat the purpose of an audit trail. Where an action already uses
`$transaction` (e.g. `recordStockIn`), the log insert joins the existing one.

**Diffing**: a small helper `diffFields(before, after, fields)` in the same file
comparing only the fields relevant to that entity (not every DB column —
`updatedAt` etc. are noise), returning `{ field, oldValue, newValue }[]` for
fields that actually changed.

## Permissions

Add to `lib/permissions.ts`'s `Resource` union and `MATRIX`:

```ts
audit_log: { owner: ["view"] },
```

Matches the existing `settings: { owner: CRUD }` row — no other role, ever.

## Page access (sidebar)

New `PageKey` `"history"` in `lib/page-access.ts`, with
`DEFAULT_ALLOWED_ROLES.history: []` (same mechanism `settings` already uses —
the role/page-permission grid is revoke-only relative to a seeded ceiling, so an
empty ceiling means no non-owner role can ever be granted this page, regardless
of what an owner configures later).

New nav item in `components/nav-config.ts`, under the existing **"ระบบ"** group:

```
ระบบ
 ├─ จัดการผู้ใช้
 ├─ ตั้งค่าระบบ
 └─ ประวัติการใช้งาน   (new — /history)
```

## Page UI (`/history`)

- Server action `listAuditLogs({ page, filters })` — `requirePermission(actor.role, "view", "audit_log")`,
  branch-scoped (matching the `listIngredients`/`listSuppliers` scoping fix from
  earlier this session — this one gets it right from day one).
- Filters: date range, actor (dropdown of branch users), entity type, action
  type (created/updated/deleted), free-text search on `entityName`.
- Table columns: วันที่/เวลา, ผู้ทำรายการ, การกระทำ (badge), ประเภทข้อมูล, ชื่อรายการ,
  ปุ่ม "ดูรายละเอียด".
- "ดูรายละเอียด" opens a dialog listing each changed field as old → new (same
  interaction pattern as the existing PO/POS detail dialogs).
- Server-side pagination via the existing `lib/pagination.ts`
  (`DEFAULT_PAGE_SIZE`/`getSkip`/`getTotalPages`) — POS sales alone could make
  this table large, so this can't be a client-side-filtered full fetch like
  `IngredientList` does.

## Delivery order

One design, delivered in three waves so each lands as a reviewable,
independently-working slice rather than one giant diff:

1. **Foundation + master data**: migration, `lib/audit-log.ts`, permissions/page-access
   wiring, the `/history` page itself, and instrumentation for ingredients, unit
   conversions, menu categories, menus, modifier groups/modifiers, recipes, suppliers.
2. **Users, purchasing, inventory**: user invite/role-change/deactivate, purchase
   orders, stock in/out/adjustments.
3. **POS + money**: checkout/sale creation, void, refund, expenses, company settings.

Wave 1 alone makes the History page real and useful (and provides the pattern
every later call site copies); waves 2–3 are additive, no rework of wave 1.

## Testing

Each wave adds/extends `*.test.ts` next to the actions it touches, following
the existing `mockDeep<PrismaClient>()` + `vitest-mock-extended` convention
already used throughout `features/*/actions/*.test.ts` — asserting
`recordAuditLog`/the underlying `auditLog.create` call happened with the
expected `action`/`entityType`/`changes` shape, same style as this session's
`ingredients.test.ts` regression tests.
