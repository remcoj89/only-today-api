import { DocStatus, DocType, type DayContent, type DocumentBase } from "../shared";
import { AppError } from "../errors";
import { createDocumentRepository } from "../repositories/documentRepository";
import { mergeLifePillars } from "../utils/lifePillars";
import { validateDocument } from "./documentValidation";
import { getUserSettings } from "./userService";
import { isDayAvailable, isDayEditable, shouldAutoClose } from "./dayAvailability";
import { updateSummary } from "./statusSummaryService";
import { resolveConflict, validateClockSkew } from "./conflictResolution";

type SaveResult = {
  document: DocumentBase;
  conflictResolution?: {
    winner: "incoming" | "existing";
  };
};

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

function buildEmptyContent(docType: DocType): Record<string, unknown> {
  if (docType === DocType.Day) {
    return buildEmptyDayContent();
  }
  if (docType === DocType.Week) {
    return { weeklyGoals: [] };
  }
  if (docType === DocType.Month) {
    return { monthlyGoals: [] };
  }
  return {
    lifeWheel: {
      work: 0,
      fun: 0,
      social: 0,
      giving: 0,
      money: 0,
      growth: 0,
      health: 0,
      love: 0
    },
    quarterGoals: []
  };
}

function mergeDayContent(content: Record<string, unknown>): DayContent {
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
  return (
    reflection.wentWell.length > 0 &&
    reflection.whyWentWell.length > 0 &&
    reflection.repeatInFuture.length > 0 &&
    reflection.wentWrong.length > 0 &&
    reflection.whyWentWrong.length > 0 &&
    reflection.doDifferently.length > 0
  );
}

async function getDayAvailabilityContext(userId: string, accessToken: string): Promise<{
  timezone: string;
  accountStartDate: string | null;
}> {
  const settings = await getUserSettings(userId, accessToken);
  return {
    timezone: settings.timezone ?? "UTC",
    accountStartDate: settings.account_start_date ?? null
  };
}

function getDefaultStatus(docType: DocType): DocumentBase["status"] {
  return docType === DocType.Day ? DocStatus.Open : "active";
}

export async function getDocument(
  userId: string,
  accessToken: string,
  docType: DocType,
  docKey: string
): Promise<DocumentBase> {
  const repo = createDocumentRepository(accessToken);
  if (docType === DocType.Day) {
    const { timezone, accountStartDate } = await getDayAvailabilityContext(userId, accessToken);
    if (!isDayAvailable(docKey, timezone, accountStartDate)) {
      throw AppError.docNotYetAvailable(docKey);
    }
  }

  const existing = await repo.findByKey(userId, docType, docKey);
  if (existing) {
    return existing;
  }

  const created = await repo.create({
    userId,
    docType,
    docKey,
    status: getDefaultStatus(docType),
    content: buildEmptyContent(docType),
    clientUpdatedAt: new Date().toISOString()
  });

  return created;
}

export async function saveDocument(
  userId: string,
  accessToken: string,
  docType: DocType,
  docKey: string,
  content: Record<string, unknown>,
  clientUpdatedAt: string,
  deviceId?: string,
  status?: "open" | "closed" | "auto_closed"
): Promise<SaveResult> {
  const repo = createDocumentRepository(accessToken);
  if (docType === DocType.Day) {
    const { timezone, accountStartDate } = await getDayAvailabilityContext(userId, accessToken);
    if (!isDayEditable(docKey, timezone, accountStartDate)) {
      throw AppError.docLocked(docKey);
    }
  }

  validateDocument(docType, content);

  const serverReceivedAt = new Date().toISOString();
  validateClockSkew(clientUpdatedAt, serverReceivedAt);

  const existing = await repo.findByKey(userId, docType, docKey);
  if (!existing) {
    const createStatus =
      docType === DocType.Day && status ? (status as DocumentBase["status"]) : getDefaultStatus(docType);
    const created = await repo.create({
      userId,
      docType,
      docKey,
      status: createStatus,
      content,
      clientUpdatedAt,
      deviceId
    });
    if (docType === DocType.Day && created.status === DocStatus.Closed) {
      await updateSummary(userId, docKey, created);
    }
    return { document: created };
  }

  const incoming: DocumentBase = {
    ...existing,
    content,
    clientUpdatedAt,
    deviceId,
    ...(status !== undefined && { status: status as DocumentBase["status"] })
  };
  const resolution = resolveConflict(existing, incoming);
  if (resolution.winner === "existing") {
    return { document: existing, conflictResolution: { winner: "existing" } };
  }

  const updatePayload: { content: Record<string, unknown>; clientUpdatedAt: string; deviceId?: string; status?: DocumentBase["status"] } = {
    content,
    clientUpdatedAt,
    deviceId
  };
  if (status !== undefined) {
    updatePayload.status = status as DocumentBase["status"];
  }
  const updated = await repo.update(existing.id, updatePayload);
  if (docType === DocType.Day && updated.status === DocStatus.Closed) {
    await updateSummary(userId, docKey, updated);
  }
  return { document: updated, conflictResolution: { winner: "incoming" } };
}

export async function closeDay(
  userId: string,
  accessToken: string,
  dateKey: string,
  reflection: DayContent["dayClose"]["reflection"]
): Promise<DocumentBase> {
  const repo = createDocumentRepository(accessToken);
  const { timezone, accountStartDate } = await getDayAvailabilityContext(userId, accessToken);

  if (!isDayEditable(dateKey, timezone, accountStartDate)) {
    throw AppError.docLocked(dateKey);
  }

  const document = await getDocument(userId, accessToken, DocType.Day, dateKey);
  const merged = mergeDayContent(document.content as Record<string, unknown>);
  merged.dayClose.reflection = reflection;

  if (!hasCompleteReflection(merged.dayClose.reflection)) {
    throw AppError.validationError("Reflection is incomplete", { dateKey });
  }

  const updated = await repo.update(document.id, {
    content: merged,
    status: DocStatus.Closed,
    clientUpdatedAt: new Date().toISOString()
  });

  await updateSummary(userId, dateKey, updated);

  return updated;
}

export async function autoClosePendingDays(userId: string, accessToken: string): Promise<number> {
  const repo = createDocumentRepository(accessToken);
  const { timezone, accountStartDate } = await getDayAvailabilityContext(userId, accessToken);
  const documents = await repo.findByUser(userId, { docType: DocType.Day });

  let closedCount = 0;
  for (const document of documents) {
    if (accountStartDate != null && document.docKey < accountStartDate) {
      continue;
    }
    if (!shouldAutoClose(document, document.docKey, timezone)) {
      continue;
    }
    const updated = await repo.update(document.id, {
      status: DocStatus.AutoClosed,
      clientUpdatedAt: new Date().toISOString()
    });
    await updateSummary(userId, document.docKey, updated);
    closedCount += 1;
  }

  return closedCount;
}

export async function listDocuments(
  userId: string,
  accessToken: string,
  options?: { docType?: DocType; since?: string }
): Promise<DocumentBase[]> {
  const repo = createDocumentRepository(accessToken);
  return repo.findByUser(userId, options);
}
