"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { uploadExpenseSlip, getExpenseSlipSignedUrl } from "@/lib/expense-slip-storage";
import { extractSlipData } from "@/lib/expense-slip-ocr";
import { DEFAULT_PAGE_SIZE, getSkip, getTotalPages } from "@/lib/pagination";
import { recordAuditLog, snapshotFields, diffFields } from "@/lib/audit-log";
import {
  expenseCategorySchema,
  ExpenseCategoryInput,
  expenseEntrySchema,
  ExpenseEntryInput,
  expenseAdjustmentSchema,
  ExpenseAdjustmentInput,
} from "../schemas/expense.schema";

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { id: user.id } });
}

function permissionErrorMessage(e: unknown, fallback: string) {
  if (e instanceof PermissionError) return fallback;
  throw e;
}

// FR-EXP-01
export async function listExpenseCategories() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูหมวดหมู่ค่าใช้จ่าย") };
  }

  const categories = await prisma.expenseCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });

  return { categories };
}

export async function createExpenseCategory(input: ExpenseCategoryInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มหมวดหมู่ค่าใช้จ่าย") };
  }

  const result = expenseCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existingCategory = await prisma.expenseCategory.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

  const category = await prisma.expenseCategory.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      createdBy: actor.id,
    },
  });

  await recordAuditLog(prisma, {
    branchId: branch.id,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "created",
    entityType: "expense_category",
    entityId: category.id,
    entityName: category.name,
    changes: snapshotFields(category, ["name"]),
  });

  return { success: true, category };
}

// Only Owner has "update"/"delete" on the "expense" resource per the matrix
// (lib/permissions.ts) — Manager/Accountant may only create/view entries.
export async function updateExpenseCategory(id: string, input: ExpenseCategoryInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขหมวดหมู่ค่าใช้จ่าย") };
  }

  const result = expenseCategorySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบหมวดหมู่ค่าใช้จ่าย" };

  const existingCategory = await prisma.expenseCategory.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existingCategory) return { error: "มีหมวดหมู่ชื่อนี้อยู่แล้ว" };

  await prisma.expenseCategory.update({
    where: { id },
    data: { name: result.data.name, updatedBy: actor.id },
  });

  const changes = diffFields(current, { name: result.data.name }, ["name"]);
  if (changes.length > 0) {
    await recordAuditLog(prisma, {
      branchId: current.branchId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: "updated",
      entityType: "expense_category",
      entityId: id,
      entityName: result.data.name,
      changes,
    });
  }

  return { success: true };
}

export async function softDeleteExpenseCategory(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบหมวดหมู่ค่าใช้จ่าย") };
  }

  const current = await prisma.expenseCategory.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบหมวดหมู่ค่าใช้จ่าย" };

  await prisma.expenseCategory.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  await recordAuditLog(prisma, {
    branchId: current.branchId,
    actorId: actor.id,
    actorName: actor.fullName,
    action: "deleted",
    entityType: "expense_category",
    entityId: id,
    entityName: current.name,
  });

  return { success: true };
}

// อ่านจำนวนเงิน + รายละเอียดจากสลิปที่แนบ (ก่อนกดบันทึกจริง) เพื่อช่วยกรอกฟอร์ม
// ให้อัตโนมัติ — เป็นแค่ความสะดวก ผู้ใช้ต้องตรวจสอบและกดบันทึกเองเสมอ ไม่มีผลต่อ
// การสร้างรายการโดยตรง (createExpenseEntry ด้านล่างใช้เฉพาะค่าที่กรอกในฟอร์มจริง)
export async function extractExpenseSlipData(slipFile: File) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ใช้งานฟีเจอร์นี้") };
  }

  return extractSlipData(slipFile);
}

// FR-EXP-02: Owner/Manager/Accountant สร้างได้ (DECISIONS.md D14). `slipFile`
// (สลิปโอนเงิน/ใบเสร็จ) เป็น optional และบันทึกได้ตอนสร้างเท่านั้น — ตัว entry
// เองเป็น append-only ledger (FR-EXP-03) ห้าม UPDATE ภายหลัง จึงไม่มี "แก้ไขสลิป"
// ทีหลัง ถ้าแนบผิดต้องสร้างรายการปรับปรุงใหม่แทน
export async function createExpenseEntry(input: ExpenseEntryInput & { slipFile?: File | null }) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์บันทึกค่าใช้จ่าย") };
  }

  const result = expenseEntrySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  let slipUrl: string | null = null;
  if (input.slipFile && input.slipFile.size > 0) {
    const uploaded = await uploadExpenseSlip(input.slipFile, branch.id);
    if (uploaded.error) return { error: uploaded.error };
    slipUrl = uploaded.path ?? null;
  }

  const entry = await prisma.expenseEntry.create({
    data: {
      branchId: branch.id,
      categoryId: result.data.categoryId,
      amount: result.data.amount,
      description: result.data.description || null,
      slipUrl,
      createdBy: actor.id,
    },
  });

  return { success: true, entryId: entry.id };
}

// สร้าง signed URL ชั่วคราวสำหรับดูสลิปที่แนบไว้ — bucket เป็น private
// จึงต้องผ่าน permission check เดียวกับการดูรายการค่าใช้จ่าย
export async function getExpenseSlipUrl(entryId: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูสลิปนี้") };
  }

  const entry = await prisma.expenseEntry.findUnique({ where: { id: entryId } });
  if (!entry?.slipUrl) return { error: "ไม่พบสลิปของรายการนี้" };

  const url = await getExpenseSlipSignedUrl(entry.slipUrl);
  if (!url) return { error: "สร้างลิงก์ดูสลิปไม่สำเร็จ" };

  return { url };
}

export async function listExpenseEntries(
  filters?: { categoryId?: string },
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการค่าใช้จ่าย") };
  }

  const where = {
    ...(filters?.categoryId ? { categoryId: filters.categoryId } : {}),
  };

  const [entries, total] = await prisma.$transaction([
    prisma.expenseEntry.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: "desc" },
      skip: getSkip(page, pageSize),
      take: pageSize,
    }),
    prisma.expenseEntry.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      id: e.id,
      categoryId: e.categoryId,
      categoryName: e.category.name,
      amount: e.amount.toString(),
      description: e.description,
      hasSlip: e.slipUrl !== null,
      reversalOfId: e.reversalOfId,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
    page,
    totalPages: getTotalPages(total, pageSize),
  };
}

// Net total per category across the WHOLE ledger (not just the current
// page) — powers the "สรุปยอดสุทธิตามหมวดหมู่" summary card, which must stay
// correct regardless of which page of listExpenseEntries is on screen.
export async function getExpenseCategoryTotals() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูรายการค่าใช้จ่าย") };
  }

  const grouped = await prisma.expenseEntry.groupBy({
    by: ["categoryId"],
    _sum: { amount: true },
  });

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId) } },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const totals = grouped
    .map((g) => ({
      categoryId: g.categoryId,
      categoryName: nameById.get(g.categoryId) ?? "—",
      net: Number(g._sum.amount ?? 0),
    }))
    .sort((a, b) => b.net - a.net);

  return {
    totals,
    grandTotal: totals.reduce((sum, t) => sum + t.net, 0),
  };
}

// FR-EXP-03: แก้ไข/ลบทำผ่านรายการปรับปรุงใหม่เท่านั้น ห้าม UPDATE/DELETE ของเดิม
// (ARCHITECTURE.md §4 Immutable Ledger) — จำกัด Owner เท่านั้น เพราะเป็น "update"
// บน resource "expense" ซึ่งมีแค่ Owner ในเมทริกซ์
export async function adjustExpenseEntry(input: ExpenseAdjustmentInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "expense");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ปรับปรุงรายการค่าใช้จ่าย") };
  }

  const result = expenseAdjustmentSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const original = await prisma.expenseEntry.findUnique({ where: { id: result.data.entryId } });
  if (!original) return { error: "ไม่พบรายการค่าใช้จ่ายนี้" };

  const adjustment = await prisma.expenseEntry.create({
    data: {
      branchId: original.branchId,
      categoryId: original.categoryId,
      amount: result.data.delta,
      description: result.data.note || null,
      reversalOfId: original.id,
      createdBy: actor.id,
    },
  });

  return { success: true, entryId: adjustment.id };
}
