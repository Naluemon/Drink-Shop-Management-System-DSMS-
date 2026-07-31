"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, User, LogOut } from "lucide-react";
import { BrandIcon } from "@/components/brand-mark";
import { getNavItemsWithState, ROLE_LABELS } from "@/components/nav-config";
import type { RolePagePermissionMap } from "@/lib/page-access";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { UserRole } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AppShellProps {
  user: { fullName: string; email: string; role: string };
  logoutAction: () => void | Promise<void>;
  permMap: RolePagePermissionMap;
  children: React.ReactNode;
}

// Left sidebar shell used by every authenticated page — replaces the old top
// bar now that there are enough sections (Phase 3-7) that a single row of
// links no longer scales. Desktop: sidebar always visible. Mobile: slides
// in from a hamburger trigger.
export function AppShell({ user, logoutAction, permMap, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="bg-background flex min-h-screen">
      <Sidebar
        user={user}
        logoutAction={logoutAction}
        permMap={permMap}
        className="hidden lg:flex"
        onNavigate={() => {}}
      />

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <Sidebar
            user={user}
            logoutAction={logoutAction}
            permMap={permMap}
            className="relative flex"
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/60 bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="hover:bg-muted -ml-2 rounded-md p-2"
            aria-label="เปิดเมนู"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <BrandIcon className="h-7 w-7 rounded-lg" />
            <span className="font-heading text-foreground text-sm font-semibold">DSMS</span>
          </Link>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  user,
  logoutAction,
  permMap,
  className,
  onNavigate,
  onClose,
}: {
  user: { fullName: string; email: string; role: string };
  logoutAction: () => void | Promise<void>;
  permMap: RolePagePermissionMap;
  className?: string;
  onNavigate: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const groups = getNavItemsWithState(user.role as UserRole, permMap);

  const initials = user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <aside
      className={cn(
        "border-border/60 bg-card/60 sticky top-0 h-screen w-72 shrink-0 flex-col border-r backdrop-blur-md",
        className,
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onNavigate}>
          <BrandIcon className="h-9 w-9 rounded-xl" />
          <span className="font-heading text-foreground text-base font-semibold tracking-tight">
            DSMS
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded-md p-1.5"
            aria-label="ปิดเมนู"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-muted-foreground px-2.5 pb-1.5 text-xs font-medium">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                const Icon = item.icon;
                const content = (
                  <>
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </>
                );
                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span
                        aria-disabled="true"
                        className="text-muted-foreground flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium opacity-50"
                      >
                        {content}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {content}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-border/60 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="hover:bg-muted data-popup-open:bg-muted flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors"
              />
            }
          >
            <span className="bg-secondary text-secondary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {initials}
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
              <span className="text-foreground w-full truncate text-sm font-medium">
                {user.fullName}
              </span>
              <span className="text-muted-foreground text-xs">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </span>
            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground truncate px-2 py-1.5 font-normal">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={<Link href="/profile" onClick={onNavigate} />}
                className="px-2 py-1.5"
              >
                <User /> โปรไฟล์ของฉัน
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="px-2 py-1.5"
                onClick={() => setConfirmLogoutOpen(true)}
              >
                <LogOut /> ออกจากระบบ
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirmLogoutOpen}
        onOpenChange={setConfirmLogoutOpen}
        title="ออกจากระบบใช่ไหม?"
        description="คุณจะต้องเข้าสู่ระบบใหม่อีกครั้งเพื่อใช้งานต่อ"
        confirmLabel="ออกจากระบบ"
        onConfirm={() => logoutAction()}
      />
    </aside>
  );
}
