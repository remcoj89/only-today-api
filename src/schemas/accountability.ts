import { z } from "zod";

const nonEmptyString = z.string().min(1);
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pairRequestBodySchema = z.object({
  toUserEmail: z.string().email(),
  toUserId: z.string().uuid().optional()
});

export const requestIdParamsSchema = z.object({
  id: nonEmptyString
});

export const dateRangeQuerySchema = z
  .object({
    startDate: dateKeySchema,
    endDate: dateKeySchema
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "startDate must be on or before endDate",
    path: ["startDate"]
  });

export const checkinBodySchema = z.object({
  message: z.string().trim().min(1).max(500)
});
