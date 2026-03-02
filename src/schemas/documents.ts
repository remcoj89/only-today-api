import { z } from "zod";
import { MAX_POMODOROS_PER_TASK } from "../shared";

const nonEmptyString = z.string().min(1);
const stringOrEmpty = z.string();
const boundedPomodoros = z.number().int().min(0).max(MAX_POMODOROS_PER_TASK);

export const DayStartSchema = z.object({
  slept8Hours: z.boolean(),
  water3Glasses: z.boolean(),
  meditation5Min: z.boolean(),
  mobility5Min: z.boolean(),
  gratefulFor: stringOrEmpty,
  intentionForDay: stringOrEmpty
});

export const OneThingSchema = z.object({
  title: stringOrEmpty,
  description: stringOrEmpty,
  pomodorosPlanned: boundedPomodoros,
  pomodorosDone: boundedPomodoros
});

export const TopThreeItemSchema = z.object({
  title: stringOrEmpty,
  description: stringOrEmpty,
  pomodorosPlanned: boundedPomodoros,
  pomodorosDone: boundedPomodoros
});

export const OtherTaskSchema = z.object({
  title: stringOrEmpty,
  description: z.string().optional(),
  pomodorosPlanned: boundedPomodoros.optional(),
  pomodorosDone: boundedPomodoros.optional()
});

export const PlanningSchema = z.object({
  oneThing: OneThingSchema,
  topThree: z.array(TopThreeItemSchema).length(3),
  otherTasks: z.array(OtherTaskSchema).optional()
});

const LifePillarItemSchema = z.object({
  task: z.string(),
  completed: z.boolean()
});

export const LifePillarsSchema = z.object({
  training: LifePillarItemSchema,
  deepRelaxation: LifePillarItemSchema,
  healthyNutrition: LifePillarItemSchema,
  realConnection: LifePillarItemSchema
});

export const LifePillarsUpdateSchema = z.object({
  training: LifePillarItemSchema.partial().optional(),
  deepRelaxation: LifePillarItemSchema.partial().optional(),
  healthyNutrition: LifePillarItemSchema.partial().optional(),
  realConnection: LifePillarItemSchema.partial().optional()
});

export const ReflectionSchema = z.object({
  wentWell: stringOrEmpty,
  whyWentWell: stringOrEmpty,
  repeatInFuture: stringOrEmpty,
  wentWrong: stringOrEmpty,
  whyWentWrong: stringOrEmpty,
  doDifferently: stringOrEmpty
});

export const DayCloseSchema = z.object({
  noScreens2Hours: z.boolean(),
  noCarbs3Hours: z.boolean(),
  tomorrowPlanned: z.boolean(),
  goalsReviewed: z.boolean(),
  reflection: ReflectionSchema
});

export const DayContentSchema = z.object({
  dayStart: DayStartSchema,
  planning: PlanningSchema,
  lifePillars: LifePillarsSchema,
  dayClose: DayCloseSchema
});

const assignedDaysSchema = z.array(z.number().int().min(0).max(6));

const weeklyGoalSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  description: stringOrEmpty,
  linkedMonthGoals: z.array(nonEmptyString),
  progress: z.number().int().min(0).max(100),
  assignedDays: assignedDaysSchema.optional().default([])
});

export const WeekContentSchema = z.object({
  weeklyGoals: z.array(weeklyGoalSchema)
});

const monthlyGoalSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  description: stringOrEmpty,
  linkedQuarterGoals: z.array(nonEmptyString),
  progress: z.number().int().min(0).max(100)
});

export const MonthContentSchema = z.object({
  monthlyGoals: z.array(monthlyGoalSchema)
});

export const LifeWheelSchema = z.object({
  work: z.number().int().min(1).max(10),
  fun: z.number().int().min(1).max(10),
  social: z.number().int().min(1).max(10),
  giving: z.number().int().min(1).max(10),
  money: z.number().int().min(1).max(10),
  growth: z.number().int().min(1).max(10),
  health: z.number().int().min(1).max(10),
  love: z.number().int().min(1).max(10)
});

export const QuarterGoalSchema = z.object({
  id: nonEmptyString,
  title: nonEmptyString,
  smartDefinition: nonEmptyString,
  whatIsDifferent: nonEmptyString,
  consequencesIfNot: nonEmptyString,
  rewardIfAchieved: nonEmptyString,
  progress: z.number().int().min(0).max(100)
});

export const QuarterContentSchema = z.object({
  lifeWheel: LifeWheelSchema,
  quarterGoals: z.array(QuarterGoalSchema).length(3)
});

export const documentParamsSchema = z.object({
  docType: z.enum(["day", "week", "month", "quarter"]),
  docKey: nonEmptyString
});

const documentStatusSchema = z.enum(["open", "closed", "auto_closed"]);

export const documentUpdateSchema = z.object({
  content: z.record(z.unknown()),
  clientUpdatedAt: z.string().datetime(),
  deviceId: z.string().min(1).optional(),
  status: documentStatusSchema.optional()
});

export const closeDaySchema = z.object({
  reflection: ReflectionSchema
});

export const documentListQuerySchema = z.object({
  docType: z.enum(["day", "week", "month", "quarter"]).optional(),
  since: z.string().datetime().optional()
});
