import { z } from "zod";

export const reportGranularitySchema = z.enum(["daily", "weekly", "monthly", "yearly"]);

// FR-RPT-01: Daily/Weekly/Monthly/Yearly, always over an explicit [from, to] range
export const reportQuerySchema = z
  .object({
    granularity: reportGranularitySchema,
    from: z.string().min(1, "กรุณาเลือกวันที่เริ่มต้น"),
    to: z.string().min(1, "กรุณาเลือกวันที่สิ้นสุด"),
  })
  .refine((data) => new Date(data.from) <= new Date(data.to), {
    message: "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด",
    path: ["to"],
  });

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

export const dateRangeSchema = z
  .object({
    from: z.string().min(1, "กรุณาเลือกวันที่เริ่มต้น"),
    to: z.string().min(1, "กรุณาเลือกวันที่สิ้นสุด"),
  })
  .refine((data) => new Date(data.from) <= new Date(data.to), {
    message: "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด",
    path: ["to"],
  });

export type DateRangeInput = z.infer<typeof dateRangeSchema>;
