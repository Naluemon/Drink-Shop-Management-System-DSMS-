import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/actions/profile";
import { logout } from "@/features/auth/actions/logout";
import { listExpenseCategories, listExpenseEntries } from "@/features/expense/actions/expense";
import { AppShell } from "@/components/app-shell";
import { ExpensePageContent } from "@/features/expense/components/expense-page-content";

// Phase 9 — Expense. SECURITY.md §1 / DECISIONS.md D14: Owner (CRUD),
// Manager/Accountant (create/view เท่านั้น) — Shift Supervisor/Cashier/
// Employee ไม่มีสิทธิ์เข้าหน้านี้เลย (ไม่มี key "expense" ของ role เหล่านั้น
// ในเมทริกซ์ lib/permissions.ts)
export default async function ExpensesPage() {
  const profile = await getProfile();
  if (profile.error || !profile.user) {
    redirect("/login");
  }

  const role = profile.user.role;
  if (role !== "owner" && role !== "manager" && role !== "accountant") {
    redirect("/dashboard");
  }

  const [categoriesResult, entriesResult] = await Promise.all([
    listExpenseCategories(),
    listExpenseEntries(),
  ]);

  if (categoriesResult.error || entriesResult.error) {
    redirect("/dashboard");
  }

  return (
    <AppShell user={profile.user} logoutAction={logout}>
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
          canManageCategories={role === "owner"}
          canAdjust={role === "owner"}
        />
      </div>
    </AppShell>
  );
}
