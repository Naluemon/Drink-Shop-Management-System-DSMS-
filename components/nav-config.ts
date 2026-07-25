import {
  LayoutDashboard,
  Package,
  BookOpen,
  Coffee,
  SlidersHorizontal,
  Boxes,
  Truck,
  ClipboardList,
  Users,
  Settings,
  ShoppingCart,
  Undo2,
  Receipt,
  BarChart3,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import type { UserRole } from "@/lib/generated/prisma/enums";

const ALL_ROLES: UserRole[] = [
  "owner",
  "manager",
  "shift_supervisor",
  "cashier",
  "employee",
  "accountant",
];

function rolesWithAnyAccess(resource: Resource, actions: Action[] = ["view"]) {
  return new Set(ALL_ROLES.filter((role) => actions.some((a) => hasPermission(role, a, resource))));
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Set<UserRole>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Nav visibility is derived straight from lib/permissions.ts (SECURITY.md §1)
// instead of a hand-maintained boolean per link — every future phase's page
// only needs one line here, and it can never drift from the matrix.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "ภาพรวม",
    items: [
      {
        href: "/dashboard",
        label: "แดชบอร์ด",
        icon: LayoutDashboard,
        roles: rolesWithAnyAccess("dashboard", ["view"]),
      },
    ],
  },
  {
    label: "ขายหน้าร้าน",
    items: [
      {
        href: "/pos",
        label: "หน้าขาย (POS)",
        icon: ShoppingCart,
        roles: rolesWithAnyAccess("pos_sale", ["create"]),
      },
      {
        href: "/refunds",
        label: "อนุมัติคืนเงิน",
        icon: Undo2,
        roles: rolesWithAnyAccess("pos_refund", ["approve"]),
      },
    ],
  },
  {
    label: "จัดการร้าน",
    items: [
      {
        href: "/ingredients",
        label: "วัตถุดิบ",
        icon: Package,
        roles: rolesWithAnyAccess("ingredient"),
      },
      { href: "/recipes", label: "สูตร", icon: BookOpen, roles: rolesWithAnyAccess("recipe") },
      { href: "/menus", label: "เมนู", icon: Coffee, roles: rolesWithAnyAccess("menu") },
      {
        href: "/modifier-groups",
        label: "กลุ่มตัวเลือก",
        icon: SlidersHorizontal,
        roles: rolesWithAnyAccess("menu"),
      },
    ],
  },
  {
    label: "คลังและจัดซื้อ",
    items: [
      {
        href: "/inventory",
        label: "สต็อก",
        icon: Boxes,
        roles: rolesWithAnyAccess("stock_in", ["view", "create"]),
      },
      {
        href: "/suppliers",
        label: "ผู้จำหน่าย",
        icon: Truck,
        roles: rolesWithAnyAccess("purchase"),
      },
      {
        href: "/purchases",
        label: "ใบสั่งซื้อ",
        icon: ClipboardList,
        roles: rolesWithAnyAccess("purchase"),
      },
    ],
  },
  {
    label: "การเงิน",
    items: [
      {
        href: "/expenses",
        label: "ค่าใช้จ่าย",
        icon: Receipt,
        roles: rolesWithAnyAccess("expense", ["view"]),
      },
      {
        href: "/reports",
        label: "รายงาน",
        icon: BarChart3,
        roles: rolesWithAnyAccess("reports", ["view"]),
      },
    ],
  },
  {
    label: "ระบบ",
    items: [
      {
        href: "/users",
        label: "จัดการผู้ใช้",
        icon: Users,
        roles: rolesWithAnyAccess("user_management", ["view", "invite"]),
      },
      {
        href: "/settings",
        label: "ตั้งค่าระบบ",
        icon: Settings,
        roles: rolesWithAnyAccess("settings"),
      },
    ],
  },
  {
    label: "ช่วยเหลือ",
    items: [
      {
        href: "/guide",
        label: "คู่มือการใช้งาน",
        icon: HelpCircle,
        // Documentation only — no data behind it, so every role can see it,
        // not just the ones with access to a given feature.
        roles: new Set(ALL_ROLES),
      },
    ],
  },
];

export const ROLE_LABELS: Record<string, string> = {
  owner: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  shift_supervisor: "หัวหน้ากะ",
  cashier: "แคชเชียร์",
  employee: "พนักงาน",
  accountant: "ฝ่ายบัญชี",
};
