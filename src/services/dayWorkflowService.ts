import { z, type ZodSchema } from "zod";
import { subDays } from "date-fns";
import {
  DocStatus,
  DocType,
  type DayContent,
  type DocumentBase,
  type LifePillarsContent,
  type OtherTaskItem,
  type TaskItem
} from "../shared";
import { AppError } from "../errors";
import {
  DayStartSchema,
  LifePillarsUpdateSchema,
  OneThingSchema,
  OtherTaskSchema,
  PlanningSchema,
  ReflectionSchema,
  TopThreeItemSchema
} from "../schemas/documents";
import { formatDateKey } from "../utils/dateUtils";
import { mergeLifePillars } from "../utils/lifePillars";
import { getUserSettings } from "./userService";
import { closeDay as closeDayDocument, getDocument, listDocuments } from "./documentService";
import { isDayEditable } from "./dayAvailability";
import { createDocumentRepository } from "../repositories/documentRepository";
import { notifyPartnerDayClosed } from "../jobs/notificationJobs";

type DayStartStatus = {
  complete: boolean;
  missingFields: string[];
};

type PlanningStatus = {
  complete: boolean;
  missingItems: string[];
};

type DayCloseStatus = {
  checklistComplete: boolean;
  reflectionComplete: boolean;
  missingChecklist: string[];
  missingReflection: string[];
};

type LifePillarKey = keyof LifePillarsContent;

type OneThingInput = {
  title: string;
  description: string;
  pomodorosPlanned: number;
};

type TopThreeInput = Array<{
  title: string;
  description: string;
  pomodorosPlanned: number;
}>;

type OtherTaskInput = {
  title: string;
  description?: string;
  pomodorosPlanned?: number;
};

type DayCloseChecklistInput = Partial<{
  noScreens2Hours: boolean;
  noCarbs3Hours: boolean;
  tomorrowPlanned: boolean;
  goalsReviewed: boolean;
}>;

function parseWithSchema<T>(schema: ZodSchema<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw AppError.validationError(message, result.error.flatten());
  }
  return result.data;
}

function buildEmptyDayContent(): DayContent {
  return {
    dayStart: {
      slept8Hours: false,
      water3Glasses: false,
      meditation5Min: false,
      mobility5Min: false,
      gratefulFor: "",
      intentionForDay: ""
    },
    planning: {
      oneThing: {
        title: "",
        description: "",
        pomodorosPlanned: 0,
        pomodorosDone: 0
      },
      topThree: [
        { title: "", description: "", pomodorosPlanned: 0, pomodorosDone: 0 },
        { title: "", description: "", pomodorosPlanned: 0, pomodorosDone: 0 },
        { title: "", description: "", pomodorosPlanned: 0, pomodorosDone: 0 }
      ],
      otherTasks: []
    },
    lifePillars: {
      training: { task: "", completed: false },
      deepRelaxation: { task: "", completed: false },
      healthyNutrition: { task: "", completed: false },
      realConnection: { task: "", completed: false }
    },
    dayClose: {
      noScreens2Hours: false,
      noCarbs3Hours: false,
      tomorrowPlanned: false,
      goalsReviewed: false,
      reflection: {
        wentWell: "",
        whyWentWell: "",
        repeatInFuture: "",
        wentWrong: "",
        whyWentWrong: "",
        doDifferently: ""
      }
    }
  };
}

function normalizeDayContent(content: Record<string, unknown>): DayContent {
  const base = buildEmptyDayContent();
  const incoming = content as Partial<DayContent>;
  return {
    ...base,
    ...incoming,
    dayStart: { ...base.dayStart, ...incoming.dayStart },
    planning: {
      ...base.planning,
      ...incoming.planning,
      oneThing: { ...base.planning.oneThing, ...incoming.planning?.oneThing },
      topThree:
        incoming.planning?.topThree && incoming.planning.topThree.length === 3
          ? incoming.planning.topThree
          : base.planning.topThree,
      otherTasks: incoming.planning?.otherTasks ?? base.planning.otherTasks
    },
    lifePillars: mergeLifePillars(base.lifePillars, incoming.lifePillars),
    dayClose: {
      ...base.dayClose,
      ...incoming.dayClose,
      reflection: { ...base.dayClose.reflection, ...incoming.dayClose?.reflection }
    }
  };
}

function hasCompleteReflection(reflection: DayContent["dayClose"]["reflection"]): boolean {
  const result = ReflectionSchema.safeParse(reflection);
  return result.success;
}

function assertDayStartComplete(document: DocumentBase) {
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const result = DayStartSchema.safeParse(content.dayStart);
  if (!result.success) {
    throw AppError.validationError("Day start is incomplete", result.error.flatten());
  }
}

async function loadDayDocument(userId: string, accessToken: string, dateKey: string) {
  return getDocument(userId, accessToken, DocType.Day, dateKey);
}

async function saveDayContent(
  userId: string,
  accessToken: string,
  dateKey: string,
  content: DayContent
) {
  const settings = await getUserSettings(userId, accessToken);
  const timeZone = settings.timezone ?? "UTC";
  if (!isDayEditable(dateKey, timeZone, settings.account_start_date ?? null)) {
    throw AppError.docLocked(dateKey);
  }
  const repo = createDocumentRepository(accessToken);
  const existing = await repo.findByKey(userId, DocType.Day, dateKey);
  if (!existing) {
    return repo.create({
      userId,
      docType: DocType.Day,
      docKey: dateKey,
      status: DocStatus.Open,
      content,
      clientUpdatedAt: new Date().toISOString()
    });
  }
  return repo.update(existing.id, {
    content,
    clientUpdatedAt: new Date().toISOString()
  });
}

export async function getDayStartStatus(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<DayStartStatus> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const missingFields: string[] = [];
  if (!content.dayStart.gratefulFor) {
    missingFields.push("gratefulFor");
  }
  if (!content.dayStart.intentionForDay) {
    missingFields.push("intentionForDay");
  }
  const complete = DayStartSchema.safeParse(content.dayStart).success;
  return { complete, missingFields };
}

export async function completeDayStart(
  userId: string,
  accessToken: string,
  dateKey: string,
  data: DayContent["dayStart"]
): Promise<DocumentBase> {
  const parsed = parseWithSchema(DayStartSchema, data, "Day start data is invalid");
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  content.dayStart = parsed;
  return saveDayContent(userId, accessToken, dateKey, content);
}

export function isDayStartComplete(document: DocumentBase): boolean {
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  return DayStartSchema.safeParse(content.dayStart).success;
}

export async function getPlanningStatus(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<PlanningStatus> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const missingItems: string[] = [];

  if (!content.planning.oneThing.title) {
    missingItems.push("oneThing.title");
  }
  if (!content.planning.oneThing.description) {
    missingItems.push("oneThing.description");
  }

  if (content.planning.topThree.length !== 3) {
    missingItems.push("topThree.length");
  } else {
    content.planning.topThree.forEach((item, index) => {
      if (!item.title) {
        missingItems.push(`topThree.${index}.title`);
      }
      if (!item.description) {
        missingItems.push(`topThree.${index}.description`);
      }
    });
  }

  const complete = PlanningSchema.safeParse(content.planning).success;
  return { complete, missingItems };
}

export async function setOneThing(
  userId: string,
  accessToken: string,
  dateKey: string,
  oneThing: OneThingInput
): Promise<DocumentBase> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  assertDayStartComplete(document);
  const parsed = parseWithSchema(
    OneThingSchema,
    { ...oneThing, pomodorosDone: 0 },
    "One thing is invalid"
  );
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  content.planning.oneThing = parsed;
  return saveDayContent(userId, accessToken, dateKey, content);
}

export async function setTopThree(
  userId: string,
  accessToken: string,
  dateKey: string,
  topThree: TopThreeInput
): Promise<DocumentBase> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  assertDayStartComplete(document);
  const parsed = parseWithSchema(
    TopThreeItemSchema.array().length(3),
    topThree.map((item) => ({ ...item, pomodorosDone: 0 })),
    "Top three items are invalid"
  );
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  content.planning.topThree = parsed.map((item) => ({
    ...item,
    pomodorosDone: 0
  })) as [TaskItem, TaskItem, TaskItem];
  return saveDayContent(userId, accessToken, dateKey, content);
}

export async function addOtherTask(
  userId: string,
  accessToken: string,
  dateKey: string,
  task: OtherTaskInput
): Promise<DocumentBase> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  assertDayStartComplete(document);
  const parsed = parseWithSchema(OtherTaskSchema, task, "Other task is invalid");
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const nextTask: OtherTaskItem = {
    ...parsed,
    pomodorosDone: parsed.pomodorosDone ?? 0
  };
  content.planning.otherTasks = [...(content.planning.otherTasks ?? []), nextTask];
  return saveDayContent(userId, accessToken, dateKey, content);
}

export function isPlanningComplete(document: DocumentBase): boolean {
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  return PlanningSchema.safeParse(content.planning).success;
}

export async function getLifePillarsStatus(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<LifePillarsContent> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  return content.lifePillars;
}

export async function updateLifePillars(
  userId: string,
  accessToken: string,
  dateKey: string,
  pillars: Partial<LifePillarsContent>
): Promise<DocumentBase> {
  const parsed = parseWithSchema(
    LifePillarsUpdateSchema,
    pillars,
    "Life pillars update is invalid"
  );
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const keys: (keyof LifePillarsContent)[] = ["training", "deepRelaxation", "healthyNutrition", "realConnection"];
  for (const key of keys) {
    const update = (parsed as Record<string, unknown>)[key];
    if (update && typeof update === "object") {
      content.lifePillars[key] = { ...content.lifePillars[key], ...(update as Partial<LifePillarsContent[typeof key]>) };
    }
  }
  return saveDayContent(userId, accessToken, dateKey, content);
}

export async function getLifePillarStreak(
  userId: string,
  accessToken: string,
  pillar: LifePillarKey
): Promise<number> {
  const settings = await getUserSettings(userId, accessToken);
  const timeZone = settings.timezone ?? "UTC";
  const documents = await listDocuments(userId, accessToken, { docType: DocType.Day });
  const dayMap = new Map(
    documents.map((document) => [
      document.docKey,
      normalizeDayContent(document.content as Record<string, unknown>)
    ])
  );

  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const dateKey = formatDateKey(subDays(new Date(), offset), timeZone);
    const content = dayMap.get(dateKey);
    if (!content || !content.lifePillars[pillar]?.completed) {
      break;
    }
    streak += 1;
  }
  return streak;
}

export async function getDayCloseStatus(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<DayCloseStatus> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const checklist = content.dayClose;
  const missingChecklist: string[] = [];

  if (!checklist.noScreens2Hours) {
    missingChecklist.push("noScreens2Hours");
  }
  if (!checklist.noCarbs3Hours) {
    missingChecklist.push("noCarbs3Hours");
  }
  if (!checklist.tomorrowPlanned) {
    missingChecklist.push("tomorrowPlanned");
  }
  if (!checklist.goalsReviewed) {
    missingChecklist.push("goalsReviewed");
  }

  const missingReflection: string[] = [];
  const reflection = checklist.reflection;
  if (!reflection.wentWell) {
    missingReflection.push("wentWell");
  }
  if (!reflection.whyWentWell) {
    missingReflection.push("whyWentWell");
  }
  if (!reflection.repeatInFuture) {
    missingReflection.push("repeatInFuture");
  }
  if (!reflection.wentWrong) {
    missingReflection.push("wentWrong");
  }
  if (!reflection.whyWentWrong) {
    missingReflection.push("whyWentWrong");
  }
  if (!reflection.doDifferently) {
    missingReflection.push("doDifferently");
  }

  return {
    checklistComplete: missingChecklist.length === 0,
    reflectionComplete: missingReflection.length === 0,
    missingChecklist,
    missingReflection
  };
}

export async function updateDayCloseChecklist(
  userId: string,
  accessToken: string,
  dateKey: string,
  checklist: DayCloseChecklistInput
): Promise<DocumentBase> {
  const checklistSchema = z
    .object({
      noScreens2Hours: z.boolean().optional(),
      noCarbs3Hours: z.boolean().optional(),
      tomorrowPlanned: z.boolean().optional(),
      goalsReviewed: z.boolean().optional()
    })
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
      message: "Checklist update must include at least one field"
    });

  const parsed = parseWithSchema(checklistSchema, checklist, "Day close checklist is invalid");
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  content.dayClose = { ...content.dayClose, ...parsed };
  return saveDayContent(userId, accessToken, dateKey, content);
}

export async function submitReflection(
  userId: string,
  accessToken: string,
  dateKey: string,
  reflection: DayContent["dayClose"]["reflection"]
): Promise<DocumentBase> {
  const parsed = parseWithSchema(ReflectionSchema, reflection, "Reflection is invalid");
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  content.dayClose.reflection = parsed;
  return saveDayContent(userId, accessToken, dateKey, content);
}

export async function closeDay(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<DocumentBase> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  if (!hasCompleteReflection(content.dayClose.reflection)) {
    throw AppError.validationError("Reflection is incomplete", { dateKey });
  }
  const closed = await closeDayDocument(userId, accessToken, dateKey, content.dayClose.reflection);
  try {
    await notifyPartnerDayClosed(userId, accessToken, dateKey);
  } catch (err) {
    console.error("[dayWorkflow] Failed to notify partner", err);
  }
  return closed;
}
