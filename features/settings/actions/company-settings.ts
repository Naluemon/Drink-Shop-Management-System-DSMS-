"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, PermissionError } from "@/lib/permissions";
import { getOrCreateCompanySettings, getOrCreateTaxSettings } from "@/lib/settings";
import {
  companyInfoSchema,
  CompanyInfoInput,
  taxSettingsSchema,
  TaxSettingsInput,
  receiptSettingsSchema,
  ReceiptSettingsInput,
  businessHoursSchema,
  BusinessHoursInput,
  stockDeficitPolicySchema,
  StockDeficitPolicyInput,
  ingredientDeficitOverrideSchema,
  IngredientDeficitOverrideInput,
} from "../schemas/settings.schema";

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

type Actor = NonNullable<Awaited<ReturnType<typeof getActor>>>;
type SettingsAccessResult = { error: string } | { actor: Actor };
type SettingsActionResult = { error: string } | { success: true };

// Explicit return type is required here — TS's inferred return type for a
// function that does `if (cond) return narrowedVar;` does NOT reliably
// narrow that return statement's contribution to the function's own overall
// return type, so callers dot-accessing `.error` after an `"error" in x`
// check fail to compile without this annotation (bit every "use server"
// action in this file the same way until added).
async function requireSettingsAccess(action: "view" | "update"): Promise<SettingsAccessResult> {
  const actor = await getActor();
  if (!actor) return { error: "กรุณาล็อกอินก่อน" };
  try {
    requirePermission(actor.role, action, "settings");
  } catch (e) {
    return { error: permissionErrorMessage(e, "คุณไม่มีสิทธิ์เข้าถึงการตั้งค่านี้") };
  }
  return { actor };
}

interface FullSettingsResult {
  companySettings: {
    registeredName: string;
    registeredAddress: string;
    companyPhone: string;
    isVatRegistered: boolean;
    taxId: string;
    receiptFooterMessage: string;
    receiptPaperWidth: "mm58" | "mm80";
    openTime: string;
    closeTime: string;
    timezone: string;
    businessDayStartHour: number;
    stockDeficitPolicy: "warn_only" | "strict_block";
  };
  taxSettings: {
    vatMode: "inclusive" | "exclusive" | "none";
    vatRate: string;
  };
  ingredients: {
    id: string;
    name: string;
    stockDeficitPolicyOverride: "warn_only" | "strict_block" | null;
  }[];
}

// Phase 12 — Settings. SECURITY.md §1: settings CRUD is Owner-only.
export async function getFullSettings(): Promise<{ error: string } | FullSettingsResult> {
  const access = await requireSettingsAccess("view");
  if ("error" in access) return access;

  const [companySettings, taxSettings, ingredients] = await Promise.all([
    getOrCreateCompanySettings(),
    getOrCreateTaxSettings(),
    prisma.ingredient.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  return {
    companySettings: {
      registeredName: companySettings.registeredName ?? "",
      registeredAddress: companySettings.registeredAddress ?? "",
      companyPhone: companySettings.companyPhone ?? "",
      isVatRegistered: companySettings.isVatRegistered,
      taxId: companySettings.taxId ?? "",
      receiptFooterMessage: companySettings.receiptFooterMessage ?? "",
      receiptPaperWidth: companySettings.receiptPaperWidth,
      openTime: companySettings.openTime ?? "",
      closeTime: companySettings.closeTime ?? "",
      timezone: companySettings.timezone,
      businessDayStartHour: companySettings.businessDayStartHour,
      stockDeficitPolicy: companySettings.stockDeficitPolicy,
    },
    taxSettings: {
      vatMode: taxSettings.vatMode,
      vatRate: taxSettings.vatRate.toString(),
    },
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      stockDeficitPolicyOverride: i.stockDeficitPolicyOverride,
    })),
  };
}

export async function updateCompanyInfo(input: CompanyInfoInput): Promise<SettingsActionResult> {
  const access = await requireSettingsAccess("update");
  if ("error" in access) return access;

  const result = companyInfoSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const settings = await getOrCreateCompanySettings();
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      registeredName: result.data.registeredName || null,
      registeredAddress: result.data.registeredAddress || null,
      companyPhone: result.data.companyPhone || null,
      isVatRegistered: result.data.isVatRegistered,
      taxId: result.data.taxId || null,
    },
  });

  return { success: true };
}

export async function updateTaxSettings(input: TaxSettingsInput): Promise<SettingsActionResult> {
  const access = await requireSettingsAccess("update");
  if ("error" in access) return access;

  const result = taxSettingsSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const settings = await getOrCreateTaxSettings();
  await prisma.taxSettings.update({
    where: { id: settings.id },
    data: { vatMode: result.data.vatMode, vatRate: result.data.vatRate },
  });

  return { success: true };
}

export async function updateReceiptSettings(
  input: ReceiptSettingsInput,
): Promise<SettingsActionResult> {
  const access = await requireSettingsAccess("update");
  if ("error" in access) return access;

  const result = receiptSettingsSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const settings = await getOrCreateCompanySettings();
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      receiptFooterMessage: result.data.receiptFooterMessage || null,
      receiptPaperWidth: result.data.receiptPaperWidth,
    },
  });

  return { success: true };
}

export async function updateBusinessHours(
  input: BusinessHoursInput,
): Promise<SettingsActionResult> {
  const access = await requireSettingsAccess("update");
  if ("error" in access) return access;

  const result = businessHoursSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const settings = await getOrCreateCompanySettings();
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: {
      openTime: result.data.openTime || null,
      closeTime: result.data.closeTime || null,
      timezone: result.data.timezone,
      businessDayStartHour: result.data.businessDayStartHour,
    },
  });

  return { success: true };
}

export async function updateStockDeficitPolicy(
  input: StockDeficitPolicyInput,
): Promise<SettingsActionResult> {
  const access = await requireSettingsAccess("update");
  if ("error" in access) return access;

  const result = stockDeficitPolicySchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  const settings = await getOrCreateCompanySettings();
  await prisma.companySettings.update({
    where: { id: settings.id },
    data: { stockDeficitPolicy: result.data.stockDeficitPolicy },
  });

  return { success: true };
}

export async function updateIngredientDeficitOverride(
  input: IngredientDeficitOverrideInput,
): Promise<SettingsActionResult> {
  const access = await requireSettingsAccess("update");
  if ("error" in access) return access;

  const result = ingredientDeficitOverrideSchema.safeParse(input);
  if (!result.success) return { error: result.error.issues[0].message };

  await prisma.ingredient.update({
    where: { id: result.data.ingredientId },
    data: {
      stockDeficitPolicyOverride: result.data.override === "default" ? null : result.data.override,
    },
  });

  return { success: true };
}
