import { z } from "zod";

export const cartItemSchema = z.object({
  menuId: z.string().min(1),
  variantId: z.string().optional(),
  modifierIds: z.array(z.string()).default([]),
  quantity: z.coerce.number().int().positive(),
  lineDiscountAmount: z.coerce.number().min(0).default(0),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

// FR-POS-03/04/06: bill-level discount + payment method — item prices/costs
// are never taken from the client, only the selections (see checkout.ts)
export const checkoutSchema = z.object({
  items: z.array(cartItemSchema).min(1, "ตะกร้าว่างเปล่า"),
  billDiscountAmount: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(["cash", "qr"]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// FR-POS-09: void บังคับ reason เสมอ
export const voidSchema = z.object({
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
});

// FR-POS-10: request refund บังคับ reason เสมอ
export const refundRequestSchema = z.object({
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
});
