import type { UserRole } from "@/lib/generated/prisma/enums";

// Central RBAC matrix — mirrors docs/SECURITY.md §1 exactly (confirmed against
// DECISIONS.md D14). Every Server Action/Route Handler must call
// requirePermission() as its first line before touching business logic
// (AGENTS.md §3, FR-RBAC-01). Resources not yet built (ingredient, recipe,
// menu, ...) are included now so later phases only ever add call-sites, never
// redesign this table — the matrix itself is already fully decided, not a guess.

export type Action = "create" | "view" | "update" | "delete" | "invite" | "approve" | "request";

export type Resource =
  | "ingredient"
  | "recipe"
  | "menu"
  | "stock_in"
  | "stock_out"
  | "adjustment"
  | "purchase"
  | "pos_sale"
  | "pos_void"
  | "pos_refund"
  | "expense"
  | "user_management"
  | "dashboard"
  | "reports"
  | "settings";

const CRUD: Action[] = ["create", "view", "update", "delete"];

// prettier-ignore
const MATRIX: Record<Resource, Partial<Record<UserRole, Action[]>>> = {
  ingredient:       { owner: CRUD, manager: CRUD, shift_supervisor: ["view"], cashier: ["view"], employee: ["view"] },
  recipe:           { owner: CRUD, manager: CRUD, shift_supervisor: ["view"], cashier: ["view"] },
  menu:             { owner: CRUD, manager: CRUD, shift_supervisor: ["view"], cashier: ["view"] },
  stock_in:         { owner: CRUD, manager: CRUD, shift_supervisor: ["create"], employee: ["create"] },
  stock_out:        { owner: CRUD, manager: CRUD, shift_supervisor: ["create"], employee: ["create"] },
  adjustment:       { owner: CRUD, manager: ["create"] },
  purchase:         { owner: CRUD, manager: CRUD, shift_supervisor: ["view"] },
  pos_sale:         { owner: ["view"], manager: ["view"], shift_supervisor: ["create"], cashier: ["create"] },
  pos_void:         { owner: CRUD, manager: CRUD, shift_supervisor: ["create"], cashier: ["create"] },
  pos_refund:       { owner: ["create", "view", "update", "delete", "approve"], manager: ["create", "view", "update", "delete", "approve"], shift_supervisor: ["approve"], cashier: ["request"] },
  expense:          { owner: CRUD, manager: ["create", "view"], accountant: ["create", "view"] },
  user_management:  { owner: [...CRUD, "invite"], manager: ["invite"] },
  dashboard:        { owner: ["view"], manager: ["view"], shift_supervisor: ["view"] },
  reports:          { owner: ["view"], manager: ["view"], shift_supervisor: ["view"], accountant: ["view"] },
  settings:         { owner: CRUD },
};

export class PermissionError extends Error {
  code = "FORBIDDEN" as const;
  constructor(role: UserRole, action: Action, resource: Resource) {
    super(`role "${role}" is not permitted to "${action}" on "${resource}"`);
    this.name = "PermissionError";
  }
}

export function hasPermission(role: UserRole, action: Action, resource: Resource): boolean {
  return MATRIX[resource][role]?.includes(action) ?? false;
}

// Throws PermissionError (code "FORBIDDEN") instead of returning a boolean so
// call-sites can't accidentally ignore the result — call this as the very
// first line of any Server Action or Route Handler that touches a resource.
export function requirePermission(role: UserRole, action: Action, resource: Resource): void {
  if (!hasPermission(role, action, resource)) {
    throw new PermissionError(role, action, resource);
  }
}

// DECISIONS.md D14: Manager may only invite Shift Supervisor/Cashier/Employee.
// Owner may invite any role, including a co-owner or Accountant.
export function canInviteRole(inviterRole: UserRole, targetRole: UserRole): boolean {
  if (inviterRole === "owner") return true;
  if (inviterRole === "manager") {
    return (
      targetRole === "shift_supervisor" || targetRole === "cashier" || targetRole === "employee"
    );
  }
  return false;
}
