"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateDefaultBranch } from "@/lib/default-branch";
import { supplierSchema, SupplierInput } from "../schemas/supplier.schema";

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

// FR-PUR-01: CRUD supplier — SECURITY.md §1 groups this under "Purchase"
// (no separate Supplier row): Owner/Manager CRUD, Shift Supervisor view-only.
export async function listSuppliers() {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "view", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ดูผู้จำหน่าย") };
  }

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });

  return { suppliers };
}

export async function createSupplier(input: SupplierInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "create", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เพิ่มผู้จำหน่าย") };
  }

  const result = supplierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const branch = await getOrCreateDefaultBranch(actor.organizationId);

  const existing = await prisma.supplier.findFirst({
    where: {
      branchId: branch.id,
      deletedAt: null,
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีผู้จำหน่ายชื่อนี้อยู่แล้ว" };

  const supplier = await prisma.supplier.create({
    data: {
      branchId: branch.id,
      name: result.data.name,
      contactInfo: result.data.contactInfo || null,
      createdBy: actor.id,
    },
  });

  return { success: true, supplier };
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "update", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์แก้ไขผู้จำหน่าย") };
  }

  const result = supplierSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const current = await prisma.supplier.findUnique({ where: { id } });
  if (!current) return { error: "ไม่พบผู้จำหน่าย" };

  const existing = await prisma.supplier.findFirst({
    where: {
      branchId: current.branchId,
      deletedAt: null,
      id: { not: id },
      name: { equals: result.data.name, mode: "insensitive" },
    },
  });
  if (existing) return { error: "มีผู้จำหน่ายชื่อนี้อยู่แล้ว" };

  await prisma.supplier.update({
    where: { id },
    data: {
      name: result.data.name,
      contactInfo: result.data.contactInfo || null,
      updatedBy: actor.id,
    },
  });

  return { success: true };
}

export async function softDeleteSupplier(id: string) {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };

  try {
    requirePermission(actor.role, "delete", "purchase");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์ลบผู้จำหน่าย") };
  }

  await prisma.supplier.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy: actor.id },
  });

  return { success: true };
}
