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
  History,
  type LucideIcon,
} from "lucide-react";
import { canAccessPage, type PageKey, type RolePagePermissionMap } from "@/lib/page-access";
import type { UserRole } from "@/lib/generated/prisma/enums";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  // Omitted => always enabled for every role (dashboard, guide) — see
  // lib/page-access.ts's PAGE_KEYS comment for why those two are excluded.
  pageKey?: PageKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Nav item list — static shape only. Per-role enabled/disabled state is
// computed at render time by getNavItemsWithState() below, from the
// owner-configurable RolePagePermission table (lib/page-access.ts), not
// hardcoded here anymore.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "ภาพรวม",
    items: [{ href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard }],
  },
  {
    label: "ขายหน้าร้าน",
    items: [
      { href: "/pos", label: "หน้าขาย (POS)", icon: ShoppingCart, pageKey: "pos" },
      { href: "/refunds", label: "อนุมัติคืนเงิน", icon: Undo2, pageKey: "refunds" },
    ],
  },
  {
    label: "จัดการร้าน",
    items: [
      { href: "/ingredients", label: "วัตถุดิบ", icon: Package, pageKey: "ingredients" },
      { href: "/recipes", label: "สูตร", icon: BookOpen, pageKey: "recipes" },
      { href: "/menus", label: "เมนู", icon: Coffee, pageKey: "menus" },
      {
        href: "/modifier-groups",
        label: "กลุ่มตัวเลือก",
        icon: SlidersHorizontal,
        pageKey: "modifier-groups",
      },
    ],
  },
  {
    label: "คลังและจัดซื้อ",
    items: [
      { href: "/inventory", label: "สต็อก", icon: Boxes, pageKey: "inventory" },
      { href: "/suppliers", label: "ผู้จำหน่าย", icon: Truck, pageKey: "suppliers" },
      { href: "/purchases", label: "ใบสั่งซื้อ", icon: ClipboardList, pageKey: "purchases" },
    ],
  },
  {
    label: "การเงิน",
    items: [
      { href: "/expenses", label: "ค่าใช้จ่าย", icon: Receipt, pageKey: "expenses" },
      { href: "/reports", label: "รายงาน", icon: BarChart3, pageKey: "reports" },
    ],
  },
  {
    label: "ระบบ",
    items: [
      { href: "/users", label: "จัดการผู้ใช้", icon: Users, pageKey: "users" },
      { href: "/settings", label: "ตั้งค่าระบบ", icon: Settings, pageKey: "settings" },
      { href: "/history", label: "ประวัติการใช้งาน", icon: History, pageKey: "history" },
    ],
  },
  {
    label: "ช่วยเหลือ",
    items: [{ href: "/guide", label: "คู่มือการใช้งาน", icon: HelpCircle }],
  },
];

export function getNavItemsWithState(
  role: UserRole,
  permMap: RolePagePermissionMap,
): (Omit<NavGroup, "items"> & { items: (NavItem & { disabled: boolean })[] })[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      disabled: item.pageKey ? !canAccessPage(role, item.pageKey, permMap) : false,
    })),
  }));
}

// Thai label per pageKey, derived from NAV_GROUPS so it can't drift from the
// sidebar's own labels — used by the Settings permission grid (Task 6).
export const PAGE_KEY_LABELS: Record<PageKey, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items)
    .filter((item): item is NavItem & { pageKey: PageKey } => item.pageKey !== undefined)
    .map((item) => [item.pageKey, item.label]),
) as Record<PageKey, string>;

export const ROLE_LABELS: Record<string, string> = {
  owner: "เจ้าของร้าน",
  manager: "ผู้จัดการ",
  shift_supervisor: "หัวหน้ากะ",
  cashier: "แคชเชียร์",
  employee: "พนักงาน",
  accountant: "ฝ่ายบัญชี",
};
