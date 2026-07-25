import { z } from "zod";

export const menuCategorySchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อหมวดหมู่"),
  type: z.enum(["food", "drink"]),
});

export type MenuCategoryInput = z.infer<typeof menuCategorySchema>;

// FR-MENU-01/02: name, ราคาตั้งต้น, รูปภาพ (URL — ไม่มี file upload infra ใน
// MVP นี้), หมวดหมู่ (ไม่บังคับ), สถานะพร้อมขาย, ผูก recipe หลัก 1 ตัว (บังคับ)
export const menuSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อเมนู"),
  recipeId: z.string().min(1, "กรุณาเลือกสูตร"),
  categoryId: z.string().optional().or(z.literal("")),
  basePrice: z.coerce.number().min(0, "ราคาต้องไม่ติดลบ"),
  imageUrl: z.string().url("URL รูปภาพไม่ถูกต้อง").optional().or(z.literal("")),
  isAvailable: z.boolean(),
});

export type MenuInput = z.infer<typeof menuSchema>;

// DECISIONS.md D3: variant ใช้ recipe_multiplier (default) หรือ
// override_recipe_id (สูตรแยกทั้งหมด) — เลือกได้ทางใดทางหนึ่งเท่านั้น
export const menuVariantSchema = z
  .object({
    name: z.string().min(1, "กรุณากรอกชื่อ variant"),
    mode: z.enum(["multiplier", "override"]),
    recipeMultiplier: z.coerce.number().positive().optional(),
    overrideRecipeId: z.string().optional(),
    priceDelta: z.coerce.number(),
    isDefault: z.boolean(),
  })
  .refine(
    (data) =>
      data.mode === "multiplier" ? data.recipeMultiplier !== undefined : !!data.overrideRecipeId,
    { message: "กรุณากรอกตัวคูณสูตร หรือเลือกสูตรทดแทน" },
  );

export type MenuVariantInput = z.infer<typeof menuVariantSchema>;
