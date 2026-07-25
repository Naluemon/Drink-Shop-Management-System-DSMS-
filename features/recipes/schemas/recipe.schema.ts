import { z } from "zod";

export const recipeSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อสูตร"),
  yield: z.coerce.number().positive("yield ต้องมากกว่า 0"),
});

export type RecipeInput = z.infer<typeof recipeSchema>;

// FR-RCP-01: quantity อ้างอิงหน่วย base_unit ของ ingredient นั้นเสมอ
export const recipeIngredientSchema = z.object({
  ingredientId: z.string().min(1, "กรุณาเลือกวัตถุดิบ"),
  quantity: z.coerce.number().positive("ปริมาณต้องมากกว่า 0"),
});

export type RecipeIngredientInput = z.infer<typeof recipeIngredientSchema>;
