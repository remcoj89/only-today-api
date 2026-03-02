import { z } from "zod";
import { MAX_POMODOROS_PER_TASK } from "../shared";
import { DayStartSchema, ReflectionSchema } from "./documents";

const nonEmptyString = z.string().min(1);
const boundedPomodoros = z.number().int().min(0).max(MAX_POMODOROS_PER_TASK);

export const dayParamsSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const dayStartBodySchema = DayStartSchema;

export const oneThingBodySchema = z.object({
  title: nonEmptyString,
  description: nonEmptyString,
  pomodorosPlanned: boundedPomodoros
});

export const topThreeBodySchema = z
  .array(
    z.object({
      title: nonEmptyString,
      description: nonEmptyString,
      pomodorosPlanned: boundedPomodoros
    })
  )
  .length(3);

export const otherTaskBodySchema = z.object({
  title: nonEmptyString,
  description: z.string().optional(),
  pomodorosPlanned: boundedPomodoros.optional()
});

const lifePillarItemUpdateSchema = z.object({
  task: z.string().optional(),
  completed: z.boolean().optional()
});

export const lifePillarsUpdateSchema = z
  .object({
    training: lifePillarItemUpdateSchema.optional(),
    deepRelaxation: lifePillarItemUpdateSchema.optional(),
    healthyNutrition: lifePillarItemUpdateSchema.optional(),
    realConnection: lifePillarItemUpdateSchema.optional()
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one pillar must be provided"
  });

export const dayCloseChecklistSchema = z
  .object({
    noScreens2Hours: z.boolean().optional(),
    noCarbs3Hours: z.boolean().optional(),
    tomorrowPlanned: z.boolean().optional(),
    goalsReviewed: z.boolean().optional()
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one checklist field must be provided"
  });

export const reflectionBodySchema = ReflectionSchema;

export const pomodoroStartSchema = z.object({
  taskType: z.enum(["oneThing", "topThree", "other"]),
  taskIndex: z.number().int().min(0).optional()
});

export const pomodoroSessionParamsSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionId: nonEmptyString
});
