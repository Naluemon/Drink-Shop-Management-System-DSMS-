import { describe, it, expect } from "vitest";
import { hasPermission, type Action, type Resource } from "./permissions";
import type { UserRole } from "./generated/prisma/enums";

// TESTING.md §11 Security Test: "ทดสอบว่า RBAC matrix ใน SECURITY.md §1 ตรงกับ
// พฤติกรรมจริงทุก role (6 role) × ทุก module". This matrix is transcribed
// independently from docs/SECURITY.md §1's table (NOT copied from
// lib/permissions.ts's own MATRIX constant) so it actually catches drift
// between the documented promise and the real implementation — testing
// hasPermission() against a copy of its own source data would be tautological.
//
// "-" cells in the doc become an empty action list here.
const EXPECTED: Record<Resource, Partial<Record<UserRole, Action[]>>> = {
  ingredient: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["view"],
    cashier: ["view"],
    employee: ["view"],
  },
  recipe: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["view"],
    cashier: ["view"],
  },
  menu: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["view"],
    cashier: ["view"],
  },
  stock_in: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["create"],
    employee: ["create"],
  },
  stock_out: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["create"],
    employee: ["create"],
  },
  // DECISIONS.md D12: Employee AND Shift Supervisor never get free-form adjustment
  adjustment: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create"],
  },
  purchase: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["view"],
  },
  pos_sale: {
    owner: ["view", "create"],
    manager: ["view"],
    shift_supervisor: ["create"],
    cashier: ["create"],
  },
  pos_void: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view", "update", "delete"],
    shift_supervisor: ["create"],
    cashier: ["create"],
  },
  pos_refund: {
    owner: ["create", "view", "update", "delete", "approve", "request"],
    manager: ["create", "view", "update", "delete", "approve", "request"],
    shift_supervisor: ["approve"],
    cashier: ["request"],
  },
  expense: {
    owner: ["create", "view", "update", "delete"],
    manager: ["create", "view"],
    accountant: ["create", "view"],
  },
  user_management: {
    owner: ["create", "view", "update", "delete", "invite"],
    manager: ["invite"],
  },
  dashboard: {
    owner: ["view"],
    manager: ["view"],
    shift_supervisor: ["view"],
  },
  reports: {
    owner: ["view"],
    manager: ["view"],
    shift_supervisor: ["view"],
    accountant: ["view"],
  },
  settings: {
    owner: ["create", "view", "update", "delete"],
  },
  audit_log: {
    owner: ["view"],
  },
};

const ALL_ROLES: UserRole[] = [
  "owner",
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
];
const ALL_ACTIONS: Action[] = [
  "create",
  "view",
  "update",
  "delete",
  "invite",
  "approve",
  "request",
];
const ALL_RESOURCES = Object.keys(EXPECTED) as Resource[];

describe("RBAC matrix vs docs/SECURITY.md §1 (TESTING.md §11.1)", () => {
  for (const resource of ALL_RESOURCES) {
    describe(resource, () => {
      for (const role of ALL_ROLES) {
        const allowedActions = EXPECTED[resource][role] ?? [];
        for (const action of ALL_ACTIONS) {
          const expected = allowedActions.includes(action);
          it(`${role} ${expected ? "CAN" : "cannot"} ${action}`, () => {
            expect(hasPermission(role, action, resource)).toBe(expected);
          });
        }
      }
    });
  }

  // SECURITY.md §1 "หมายเหตุสำคัญ" — call out the specific rules explicitly
  it("never grants Employee or Shift Supervisor free-form adjustment (D12)", () => {
    expect(hasPermission("employee", "create", "adjustment")).toBe(false);
    expect(hasPermission("shift_supervisor", "create", "adjustment")).toBe(false);
  });

  it("never lets Cashier approve or finalize a refund, only request it (D5/D14)", () => {
    expect(hasPermission("cashier", "request", "pos_refund")).toBe(true);
    expect(hasPermission("cashier", "approve", "pos_refund")).toBe(false);
    expect(hasPermission("cashier", "create", "pos_refund")).toBe(false);
  });

  it("locks Accountant out of POS, Inventory, Settings, and User Management entirely (D14)", () => {
    for (const resource of [
      "pos_sale",
      "pos_void",
      "pos_refund",
      "stock_in",
      "stock_out",
      "adjustment",
      "settings",
      "user_management",
    ] as Resource[]) {
      for (const action of ALL_ACTIONS) {
        expect(hasPermission("accountant", action, resource)).toBe(false);
      }
    }
  });

  it("gives only Owner any access to Settings (D-implicit)", () => {
    for (const role of ALL_ROLES.filter((r) => r !== "owner")) {
      for (const action of ALL_ACTIONS) {
        expect(hasPermission(role, action, "settings")).toBe(false);
      }
    }
  });
});
