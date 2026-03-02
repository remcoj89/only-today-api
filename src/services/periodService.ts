import { randomUUID } from "crypto";
import type { ZodSchema } from "zod";
import {
  DocType,
  type DocumentBase,
  type LifeWheelScores,
  type MonthGoal,
  type MonthStartContent,
  type QuarterGoal,
  type QuarterStartContent,
  type WeekGoal,
  type WeekStartContent
} from "../shared";
import { AppError } from "../errors";
import { createDocumentRepository } from "../repositories/documentRepository";
import {
  LifeWheelSchema,
  MonthContentSchema,
  QuarterGoalSchema,
  WeekContentSchema
} from "../schemas/documents";

export type QuarterGoalInput = {
  title: string;
  smartDefinition: string;
  whatIsDifferent: string;
  consequencesIfNot: string;
  rewardIfAchieved: string;
};

export type MonthGoalInput = {
  title: string;
  description: string;
  linkedQuarterGoals: string[];
};

export type WeekGoalInput = {
  id?: string;
  title: string;
  description: string;
  linkedMonthGoals: string[];
  progress?: number;
  assignedDays?: number[];
};

const quarterKeyPattern = /^(\d{4})-Q([1-4])$/;
const monthKeyPattern = /^(\d{4})-(\d{2})$/;
const weekKeyPattern = /^(\d{4})-W(\d{2})$/;

function parseWithSchema<T>(schema: ZodSchema<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw AppError.validationError(message, result.error.flatten());
  }
  return result.data;
}

function createEmptyLifeWheel(): LifeWheelScores {
  return {
    work: 0,
    fun: 0,
    social: 0,
    giving: 0,
    money: 0,
    growth: 0,
    health: 0,
    love: 0
  };
}

function createEmptyQuarterContent(): QuarterStartContent {
  return { lifeWheel: createEmptyLifeWheel(), quarterGoals: [] };
}

function createEmptyMonthContent(): MonthStartContent {
  return { monthlyGoals: [] };
}

function createEmptyWeekContent(): WeekStartContent {
  return { weeklyGoals: [] };
}

function requireValidDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw AppError.validationError("Invalid date", { value });
  }
  return date;
}

function getQuarterKey(date: Date): string {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getWeekKey(date: Date): string {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function assertValidQuarterKey(quarterKey: string) {
  if (!quarterKeyPattern.test(quarterKey)) {
    throw AppError.validationError("Invalid quarter key", { quarterKey });
  }
}

function assertValidMonthKey(monthKey: string) {
  if (!monthKeyPattern.test(monthKey)) {
    throw AppError.validationError("Invalid month key", { monthKey });
  }
}

function assertValidWeekKey(weekKey: string) {
  if (!weekKeyPattern.test(weekKey)) {
    throw AppError.validationError("Invalid week key", { weekKey });
  }
}

async function requireDocument(
  accessToken: string,
  userId: string,
  docType: DocType,
  docKey: string
): Promise<DocumentBase> {
  const repo = createDocumentRepository(accessToken);
  const document = await repo.findByKey(userId, docType, docKey);
  if (!document) {
    throw AppError.validationError("Document not found", { docType, docKey });
  }
  return document;
}

export async function createQuarterStart(
  userId: string,
  accessToken: string,
  startDate: string
): Promise<DocumentBase> {
  const date = requireValidDate(startDate);
  const quarterKey = getQuarterKey(date);
  const repo = createDocumentRepository(accessToken);
  const existing = await repo.findByKey(userId, DocType.Quarter, quarterKey);
  if (existing) {
    return existing;
  }
  return repo.create({
    userId,
    docType: DocType.Quarter,
    docKey: quarterKey,
    status: "active",
    content: createEmptyQuarterContent(),
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function getCurrentQuarter(
  userId: string,
  accessToken: string
): Promise<DocumentBase> {
  const repo = createDocumentRepository(accessToken);
  const [latest] = await repo.findByUser(userId, {
    docType: DocType.Quarter,
    order: "desc",
    limit: 1
  });
  if (!latest) {
    throw AppError.validationError("No quarter document found", { userId });
  }
  return latest;
}

export async function updateLifeWheel(
  userId: string,
  accessToken: string,
  quarterKey: string,
  scores: LifeWheelScores
): Promise<DocumentBase> {
  assertValidQuarterKey(quarterKey);
  const parsedScores = parseWithSchema(LifeWheelSchema, scores, "Invalid life wheel scores");
  const document = await requireDocument(accessToken, userId, DocType.Quarter, quarterKey);
  const current = document.content as QuarterStartContent;
  const updatedContent: QuarterStartContent = {
    lifeWheel: parsedScores,
    quarterGoals: current?.quarterGoals ?? []
  };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function setQuarterGoals(
  userId: string,
  accessToken: string,
  quarterKey: string,
  goals: QuarterGoalInput[]
): Promise<DocumentBase> {
  assertValidQuarterKey(quarterKey);
  const document = await requireDocument(accessToken, userId, DocType.Quarter, quarterKey);
  if (goals.length !== 3) {
    throw AppError.validationError("Quarter goals must contain exactly 3 items", {
      count: goals.length
    });
  }
  const mappedGoals: QuarterGoal[] = goals.map((goal) => ({
    id: randomUUID(),
    title: goal.title,
    smartDefinition: goal.smartDefinition,
    whatIsDifferent: goal.whatIsDifferent,
    consequencesIfNot: goal.consequencesIfNot,
    rewardIfAchieved: goal.rewardIfAchieved,
    progress: 0
  }));
  parseWithSchema(
    QuarterGoalSchema.array().length(3),
    mappedGoals,
    "Quarter goals are invalid"
  );
  const current = document.content as QuarterStartContent;
  const updatedContent: QuarterStartContent = {
    lifeWheel: current?.lifeWheel ?? createEmptyLifeWheel(),
    quarterGoals: mappedGoals
  };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function updateQuarterGoalProgress(
  userId: string,
  accessToken: string,
  quarterKey: string,
  goalIndex: number,
  progress: number
): Promise<DocumentBase> {
  assertValidQuarterKey(quarterKey);
  if (!Number.isInteger(goalIndex) || goalIndex < 0) {
    throw AppError.validationError("Invalid goal index", { goalIndex });
  }
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw AppError.validationError("Invalid progress value", { progress });
  }
  const document = await requireDocument(accessToken, userId, DocType.Quarter, quarterKey);
  const current = document.content as QuarterStartContent;
  const quarterGoals = current?.quarterGoals ?? [];
  if (goalIndex >= quarterGoals.length) {
    throw AppError.validationError("Quarter goal not found", { goalIndex });
  }
  const updatedGoals = quarterGoals.map((goal, index) =>
    index === goalIndex ? { ...goal, progress } : goal
  );
  const updatedContent: QuarterStartContent = {
    lifeWheel: current?.lifeWheel ?? createEmptyLifeWheel(),
    quarterGoals: updatedGoals
  };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function createMonthStart(
  userId: string,
  accessToken: string,
  monthKey: string
): Promise<DocumentBase> {
  assertValidMonthKey(monthKey);
  await getCurrentQuarter(userId, accessToken);
  const repo = createDocumentRepository(accessToken);
  const existing = await repo.findByKey(userId, DocType.Month, monthKey);
  if (existing) {
    return existing;
  }
  return repo.create({
    userId,
    docType: DocType.Month,
    docKey: monthKey,
    status: "active",
    content: createEmptyMonthContent(),
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function getCurrentMonth(
  userId: string,
  accessToken: string
): Promise<DocumentBase> {
  const repo = createDocumentRepository(accessToken);
  const [latest] = await repo.findByUser(userId, {
    docType: DocType.Month,
    order: "desc",
    limit: 1
  });
  if (!latest) {
    throw AppError.validationError("No month document found", { userId });
  }
  return latest;
}

export async function setMonthlyGoals(
  userId: string,
  accessToken: string,
  monthKey: string,
  goals: MonthGoalInput[]
): Promise<DocumentBase> {
  assertValidMonthKey(monthKey);
  const document = await requireDocument(accessToken, userId, DocType.Month, monthKey);
  const currentQuarter = await getCurrentQuarter(userId, accessToken);
  const quarterContent = currentQuarter.content as QuarterStartContent;
  const availableQuarterGoals = new Set(
    (quarterContent?.quarterGoals ?? []).map((goal) => goal.id)
  );
  const mappedGoals: MonthGoal[] = goals.map((goal) => ({
    id: randomUUID(),
    title: goal.title,
    description: goal.description,
    linkedQuarterGoals: goal.linkedQuarterGoals,
    progress: 0
  }));
  const invalidLink = mappedGoals.find((goal) =>
    goal.linkedQuarterGoals.some((id) => !availableQuarterGoals.has(id))
  );
  if (invalidLink) {
    throw AppError.validationError("Monthly goal links to unknown quarter goal", {
      linkedQuarterGoals: invalidLink.linkedQuarterGoals
    });
  }
  parseWithSchema(MonthContentSchema, { monthlyGoals: mappedGoals }, "Monthly goals are invalid");
  const updatedContent: MonthStartContent = {
    monthlyGoals: mappedGoals
  };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function updateMonthGoalProgress(
  userId: string,
  accessToken: string,
  monthKey: string,
  goalIndex: number,
  progress: number
): Promise<DocumentBase> {
  assertValidMonthKey(monthKey);
  if (!Number.isInteger(goalIndex) || goalIndex < 0) {
    throw AppError.validationError("Invalid goal index", { goalIndex });
  }
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw AppError.validationError("Invalid progress value", { progress });
  }
  const document = await requireDocument(accessToken, userId, DocType.Month, monthKey);
  const current = document.content as MonthStartContent;
  const goals = current?.monthlyGoals ?? [];
  if (goalIndex >= goals.length) {
    throw AppError.validationError("Monthly goal not found", { goalIndex });
  }
  const updatedGoals = goals.map((goal, index) =>
    index === goalIndex ? { ...goal, progress } : goal
  );
  const updatedContent: MonthStartContent = { monthlyGoals: updatedGoals };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function createWeekStart(
  userId: string,
  accessToken: string,
  weekKey: string
): Promise<DocumentBase> {
  assertValidWeekKey(weekKey);
  await getCurrentMonth(userId, accessToken);
  const repo = createDocumentRepository(accessToken);
  const existing = await repo.findByKey(userId, DocType.Week, weekKey);
  if (existing) {
    return existing;
  }
  return repo.create({
    userId,
    docType: DocType.Week,
    docKey: weekKey,
    status: "active",
    content: createEmptyWeekContent(),
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function getCurrentWeek(
  userId: string,
  accessToken: string
): Promise<DocumentBase> {
  const repo = createDocumentRepository(accessToken);
  const [latest] = await repo.findByUser(userId, {
    docType: DocType.Week,
    order: "desc",
    limit: 1
  });
  if (!latest) {
    throw AppError.validationError("No week document found", { userId });
  }
  return latest;
}

export async function setWeeklyGoals(
  userId: string,
  accessToken: string,
  weekKey: string,
  goals: WeekGoalInput[]
): Promise<DocumentBase> {
  assertValidWeekKey(weekKey);
  const document = await requireDocument(accessToken, userId, DocType.Week, weekKey);
  const currentMonth = await getCurrentMonth(userId, accessToken);
  const monthContent = currentMonth.content as MonthStartContent;
  const availableMonthGoals = new Set((monthContent?.monthlyGoals ?? []).map((goal) => goal.id));
  const currentContent = document.content as WeekStartContent;
  const existingGoals = currentContent?.weeklyGoals ?? [];
  const mappedGoals: WeekGoal[] = goals.map((goal, index) => ({
    id: goal.id && /^[0-9a-f-]{36}$/i.test(goal.id) ? goal.id : randomUUID(),
    title: goal.title,
    description: goal.description,
    linkedMonthGoals: goal.linkedMonthGoals,
    progress: typeof goal.progress === "number" ? goal.progress : (existingGoals[index]?.progress ?? 0),
    assignedDays: Array.isArray(goal.assignedDays) ? goal.assignedDays.filter((d) => d >= 0 && d <= 6) : []
  }));
  const invalidLink = mappedGoals.find((goal) =>
    goal.linkedMonthGoals.some((id) => !availableMonthGoals.has(id))
  );
  if (invalidLink) {
    throw AppError.validationError("Weekly goal links to unknown month goal", {
      linkedMonthGoals: invalidLink.linkedMonthGoals
    });
  }
  parseWithSchema(WeekContentSchema, { weeklyGoals: mappedGoals }, "Weekly goals are invalid");
  const updatedContent: WeekStartContent = { weeklyGoals: mappedGoals };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function updateWeekGoalProgress(
  userId: string,
  accessToken: string,
  weekKey: string,
  goalIndex: number,
  progress: number
): Promise<DocumentBase> {
  assertValidWeekKey(weekKey);
  if (!Number.isInteger(goalIndex) || goalIndex < 0) {
    throw AppError.validationError("Invalid goal index", { goalIndex });
  }
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw AppError.validationError("Invalid progress value", { progress });
  }
  const document = await requireDocument(accessToken, userId, DocType.Week, weekKey);
  const current = document.content as WeekStartContent;
  const goals = current?.weeklyGoals ?? [];
  if (goalIndex >= goals.length) {
    throw AppError.validationError("Weekly goal not found", { goalIndex });
  }
  const updatedGoals = goals.map((goal, index) =>
    index === goalIndex ? { ...goal, progress } : goal
  );
  const updatedContent: WeekStartContent = { weeklyGoals: updatedGoals };
  const repo = createDocumentRepository(accessToken);
  return repo.update(document.id, {
    content: updatedContent,
    clientUpdatedAt: new Date().toISOString()
  });
}

export const periodServiceUtils = {
  getQuarterKey,
  getMonthKey
};
