import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { getRolePagePermissionMap, canAccessPage } from "@/lib/page-access";
import {
  listExpenseCategories,
  listExpenseEntries,
  getExpenseCategoryTotals,
} from "@/features/expense/actions/expense";
import { AppShell } from "@/components/app-shell";
import { ExpensePageContent } from "@/features/expense/components/expense-page-content";
import { parsePageParam } from "@/lib/pagination";

// Phase 9 — Expense. SECURITY.md §1 / DECISIONS.md D14: Owner (CRUD),
// Manager/Accountant (create/view เท่านั้น) — Shift Supervisor/Cashier/
// Employee ไม่มีสิทธิ์เข้าหน้านี้เลย (ไม่มี key "expense" ของ role เหล่านั้น
// ในเมทริกซ์ lib/permissions.ts)
export default async function ExpensesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page = parsePageParam(searchParams.page);
  const categoryFilter =
    typeof searchParams.category === "string" && searchParams.category
      ? searchParams.category
      : undefined;

  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  const permMap = await getRolePagePermissionMap();
  if (!canAccessPage(role, "expenses", permMap)) {
    redirect("/dashboard");
  }

  const [categoriesResult, entriesResult, totalsResult] = await Promise.all([
    listExpenseCategories(),
    listExpenseEntries({ categoryId: categoryFilter }, page),
    getExpenseCategoryTotals(),
  ]);

  if (categoriesResult.error || entriesResult.error) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout} permMap={permMap}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold tracking-tight">
            ค่าใช้จ่าย
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            บันทึกค่าใช้จ่ายร้าน (ค่าเช่า, ค่าไฟ, เงินเดือน, เบ็ดเตล็ด) แบบ append-only
          </p>
        </div>

        <ExpensePageContent
          categories={categoriesResult.categories ?? []}
          entries={entriesResult.entries ?? []}
          categoryTotals={totalsResult.totals ?? []}
          grandTotal={totalsResult.grandTotal ?? 0}
          canManageCategories={role === "owner"}
          canAdjust={role === "owner"}
          categoryFilter={categoryFilter}
          page={entriesResult.page ?? 1}
          totalPages={entriesResult.totalPages ?? 1}
          total={entriesResult.total ?? 0}
        />
      </div>
    </AppShell>
  );
}
