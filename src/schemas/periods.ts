import { z } from "zod";
import { LifeWheelSchema } from "./documents";

const nonEmptyString = z.string().min(1);

export const quarterStartSchema = z.object({
  startDate: nonEmptyString
});

export const monthStartSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/)
});

export const weekStartSchema = z.object({
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/)
});

export const periodKeyParamsSchema = z.object({
  key: nonEmptyString
});

export const goalProgressParamsSchema = z.object({
  key: nonEmptyString,
  index: z.coerce.number().int().min(0)
});

export const quarterGoalInputSchema = z.object({
  title: nonEmptyString,
  smartDefinition: nonEmptyString,
  whatIsDifferent: nonEmptyString,
  consequencesIfNot: nonEmptyString,
  rewardIfAchieved: nonEmptyString
});

export const monthGoalInputSchema = z.object({
  title: nonEmptyString,
  description: z.string().default(""),
  linkedQuarterGoals: z.array(nonEmptyString).default([])
});

export const weekGoalInputSchema = z.object({
  id: z.string().optional(),
  title: nonEmptyString,
  description: z.string().default(""),
  linkedMonthGoals: z.array(nonEmptyString).default([]),
  progress: z.number().int().min(0).max(100).optional(),
  assignedDays: z.array(z.number().int().min(0).max(6)).optional().default([])
});

export const quarterGoalsSchema = z.object({
  goals: z.array(quarterGoalInputSchema).length(3)
});

export const monthGoalsSchema = z.object({
  goals: z.array(monthGoalInputSchema)
});

export const weekGoalsSchema = z.object({
  goals: z.array(weekGoalInputSchema)
});

export const lifeWheelUpdateSchema = LifeWheelSchema;

export const progressUpdateSchema = z.object({
  progress: z.number().int().min(0).max(100)
});

export const relatedGoalParamsSchema = z.object({
  type: z.enum(["week"]),
  index: z.coerce.number().int().min(0)
});
