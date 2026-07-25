import { describe, it, expect } from "vitest";
import { hasPermission, requirePermission, canInviteRole, PermissionError } from "./permissions";

describe("hasPermission — SECURITY.md §1 RBAC matrix", () => {
  // TC-RBAC-01: Accountant พยายามเข้าหน้า POS หรือ Inventory ต้องถูกปฏิเสธ
  it("denies Accountant on POS and Inventory (TC-RBAC-01)", () => {
    expect(hasPermission("accountant", "create", "pos_sale")).toBe(false);
    expect(hasPermission("accountant", "view", "pos_sale")).toBe(false);
    expect(hasPermission("accountant", "create", "stock_in")).toBe(false);
    expect(hasPermission("accountant", "create", "stock_out")).toBe(false);
    expect(hasPermission("accountant", "create", "adjustment")).toBe(false);
  });

  it("lets Accountant only create/view expenses and view reports", () => {
    expect(hasPermission("accountant", "create", "expense")).toBe(true);
    expect(hasPermission("accountant", "view", "expense")).toBe(true);
    expect(hasPermission("accountant", "delete", "expense")).toBe(false);
    expect(hasPermission("accountant", "view", "reports")).toBe(true);
    expect(hasPermission("accountant", "view", "settings")).toBe(false);
    expect(hasPermission("accountant", "invite", "user_management")).toBe(false);
  });

  // DECISIONS.md D12: Employee and Shift Supervisor never get free-form adjustment
  it("denies adjustment to Employee and Shift Supervisor (D12)", () => {
    expect(hasPermission("employee", "create", "adjustment")).toBe(false);
    expect(hasPermission("shift_supervisor", "create", "adjustment")).toBe(false);
    expect(hasPermission("manager", "create", "adjustment")).toBe(true);
    expect(hasPermission("owner", "create", "adjustment")).toBe(true);
  });

  it("lets Shift Supervisor do stock in/out but not view Purchase CRUD", () => {
    expect(hasPermission("shift_supervisor", "create", "stock_in")).toBe(true);
    expect(hasPermission("shift_supervisor", "create", "stock_out")).toBe(true);
    expect(hasPermission("shift_supervisor", "view", "purchase")).toBe(true);
    expect(hasPermission("shift_supervisor", "create", "purchase")).toBe(false);
  });

  // DECISIONS.md D5/D14: refund approval — Shift Supervisor approves within
  // threshold (enforced by the caller, not this table), Cashier can only request.
  it("gives Shift Supervisor approve and Cashier only request on refunds", () => {
    expect(hasPermission("shift_supervisor", "approve", "pos_refund")).toBe(true);
    expect(hasPermission("shift_supervisor", "request", "pos_refund")).toBe(false);
    expect(hasPermission("cashier", "request", "pos_refund")).toBe(true);
    expect(hasPermission("cashier", "approve", "pos_refund")).toBe(false);
  });

  it("gives Owner and Manager full user_management CRUD plus invite", () => {
    expect(hasPermission("owner", "invite", "user_management")).toBe(true);
    expect(hasPermission("owner", "delete", "user_management")).toBe(true);
    expect(hasPermission("manager", "invite", "user_management")).toBe(true);
    expect(hasPermission("manager", "delete", "user_management")).toBe(false);
    expect(hasPermission("manager", "view", "user_management")).toBe(false);
  });

  it("restricts settings to Owner only", () => {
    expect(hasPermission("owner", "update", "settings")).toBe(true);
    for (const role of [
      "manager",
      "shift_supervisor",
      "cashier",
      "employee",
      "accountant",
    ] as const) {
      expect(hasPermission(role, "update", "settings")).toBe(false);
      expect(hasPermission(role, "view", "settings")).toBe(false);
    }
  });
});

describe("requirePermission", () => {
  it("does not throw when permitted", () => {
    expect(() => requirePermission("owner", "view", "settings")).not.toThrow();
  });

  it("throws a PermissionError with FORBIDDEN code when not permitted", () => {
    expect(() => requirePermission("accountant", "create", "pos_sale")).toThrow(PermissionError);
    try {
      requirePermission("accountant", "create", "pos_sale");
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionError);
      expect((e as PermissionError).code).toBe("FORBIDDEN");
    }
  });
});

describe("canInviteRole — DECISIONS.md D14 invite hierarchy / FR-RBAC-02", () => {
  it("lets Owner invite every role including co-owner and Accountant", () => {
    for (const role of [
      "owner",
      "manager",
      "shift_supervisor",
      "cashier",
      "employee",
      "accountant",
    ] as const) {
      expect(canInviteRole("owner", role)).toBe(true);
    }
  });

  it("lets Manager invite only Shift Supervisor, Cashier, Employee", () => {
    expect(canInviteRole("manager", "shift_supervisor")).toBe(true);
    expect(canInviteRole("manager", "cashier")).toBe(true);
    expect(canInviteRole("manager", "employee")).toBe(true);
  });

  it("blocks Manager from inviting Owner, Manager, or Accountant", () => {
    expect(canInviteRole("manager", "owner")).toBe(false);
    expect(canInviteRole("manager", "manager")).toBe(false);
    expect(canInviteRole("manager", "accountant")).toBe(false);
  });

  it("blocks every non-Owner/Manager role from inviting anyone", () => {
    for (const role of ["shift_supervisor", "cashier", "employee", "accountant"] as const) {
      expect(canInviteRole(role, "employee")).toBe(false);
    }
  });
});
