import { z } from "zod";

export const modifierGroupSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อกลุ่มตัวเลือก"),
  selectionType: z.enum(["single", "multiple"]),
  isRequired: z.boolean(),
});

export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

// DECISIONS.md D3: modifier ผูก ingredient+quantity ได้ (กินสต็อก) หรือไม่ผูกเลย
export const modifierSchema = z
  .object({
    name: z.string().min(1, "กรุณากรอกชื่อตัวเลือก"),
    ingredientId: z.string().optional().or(z.literal("")),
    ingredientQuantity: z.coerce.number().positive().optional(),
    priceDelta: z.coerce.number(),
  })
  .refine((data) => !data.ingredientId || data.ingredientQuantity !== undefined, {
    message: "กรุณาระบุปริมาณวัตถุดิบที่ใช้",
    path: ["ingredientQuantity"],
  });

export type ModifierInput = z.infer<typeof modifierSchema>;
