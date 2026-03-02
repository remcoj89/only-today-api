import { z } from "zod";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const analyticsDateRangeSchema = z.object({
  startDate: dateKeySchema,
  endDate: dateKeySchema
});

export const analyticsYearSchema = z.object({
  year: z.string().regex(/^\d{4}$/)
});
