import { randomUUID } from "crypto";
import type { DocumentBase, DayContent, TaskItem, OtherTaskItem } from "../shared";
import { DocStatus, DocType } from "../shared";
import { AppError } from "../errors";
import { getUserSettings } from "./userService";
import { getDocument } from "./documentService";
import { createDocumentRepository } from "../repositories/documentRepository";
import { mergeLifePillars } from "../utils/lifePillars";
import { isDayEditable } from "./dayAvailability";
import { sendPushNotification } from "./notificationService";
import type { PomodoroSession, TaskReference, TaskType } from "../types/pomodoro";

const sessions = new Map<string, PomodoroSession>();

type TaskLookup = {
  task: TaskItem | OtherTaskItem;
  updateTask: (next: TaskItem | OtherTaskItem) => DayContent;
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

async function loadDayDocument(userId: string, accessToken: string, dateKey: string): Promise<DocumentBase> {
  return getDocument(userId, accessToken, DocType.Day, dateKey);
}

async function saveDayContent(
  userId: string,
  accessToken: string,
  dateKey: string,
  content: DayContent
): Promise<DocumentBase> {
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

function resolveTask(content: DayContent, reference: TaskReference): TaskLookup {
  if (reference.taskType === "oneThing") {
    return {
      task: content.planning.oneThing,
      updateTask: (next) => ({
        ...content,
        planning: { ...content.planning, oneThing: next as TaskItem }
      })
    };
  }
  if (reference.taskType === "topThree") {
    if (reference.taskIndex === undefined || reference.taskIndex < 0 || reference.taskIndex > 2) {
      throw AppError.validationError("Invalid top three index", { taskIndex: reference.taskIndex });
    }
    const taskIndex = reference.taskIndex;
    const tasks = [...content.planning.topThree];
    const task = tasks[taskIndex];
    if (!task) {
      throw AppError.validationError("Top three task not found", { taskIndex });
    }
    return {
      task,
      updateTask: (next) => {
        tasks[taskIndex] = next as TaskItem;
        return {
          ...content,
          planning: { ...content.planning, topThree: tasks as [TaskItem, TaskItem, TaskItem] }
        };
      }
    };
  }
  if (!content.planning.otherTasks || content.planning.otherTasks.length === 0) {
    throw AppError.validationError("No other tasks available", { taskIndex: reference.taskIndex });
  }
  if (reference.taskIndex === undefined || reference.taskIndex < 0) {
    throw AppError.validationError("Invalid other task index", { taskIndex: reference.taskIndex });
  }
  const taskIndex = reference.taskIndex;
  const otherTasks = [...content.planning.otherTasks];
  const task = otherTasks[taskIndex];
  if (!task) {
    throw AppError.validationError("Other task not found", { taskIndex });
  }
  return {
    task,
    updateTask: (next) => {
      otherTasks[taskIndex] = next as OtherTaskItem;
      return {
        ...content,
        planning: { ...content.planning, otherTasks }
      };
    }
  };
}

function assertPomodoroAvailable(task: TaskItem | OtherTaskItem) {
  const planned = task.pomodorosPlanned ?? 0;
  const done = task.pomodorosDone ?? 0;
  if (planned <= 0) {
    throw AppError.validationError("Pomodoros planned is required", { planned });
  }
  if (done >= planned) {
    throw AppError.validationError("Pomodoros planned limit reached", { planned, done });
  }
}

export async function startPomodoro(
  userId: string,
  accessToken: string,
  dateKey: string,
  taskType: TaskType,
  taskIndex?: number
): Promise<PomodoroSession> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const { task } = resolveTask(content, { taskType, taskIndex });
  assertPomodoroAvailable(task);

  const session: PomodoroSession = {
    id: randomUUID(),
    userId,
    dateKey,
    taskType,
    taskIndex,
    startedAt: new Date().toISOString()
  };
  sessions.set(session.id, session);

  sendPushNotification(userId, {
    type: "pomodoro_start",
    title: "Focus time",
    body: "25 minutes started.",
    data: { dateKey },
    targetDate: dateKey
  }).catch(() => {});

  return session;
}

export async function completePomodoro(
  userId: string,
  accessToken: string,
  dateKey: string,
  sessionId: string
): Promise<DocumentBase> {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId || session.dateKey !== dateKey) {
    throw AppError.validationError("Pomodoro session not found", { sessionId });
  }

  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  const { task, updateTask } = resolveTask(content, {
    taskType: session.taskType,
    taskIndex: session.taskIndex
  });

  assertPomodoroAvailable(task);
  const planned = task.pomodorosPlanned ?? 0;
  const done = (task.pomodorosDone ?? 0) + 1;
  if (done > planned) {
    throw AppError.validationError("Pomodoros planned limit reached", { planned, done });
  }

  const updatedTask: TaskItem | OtherTaskItem = { ...task, pomodorosDone: done };
  const updatedContent = updateTask(updatedTask);
  session.completedAt = new Date().toISOString();
  sessions.set(sessionId, session);

  return saveDayContent(userId, accessToken, dateKey, updatedContent);
}

export async function startBreak(
  userId: string,
  dateKey: string,
  sessionId: string
): Promise<PomodoroSession> {
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId || session.dateKey !== dateKey) {
    throw AppError.validationError("Pomodoro session not found", { sessionId });
  }
  session.breakStartedAt = new Date().toISOString();
  sessions.set(sessionId, session);

  sendPushNotification(userId, {
    type: "pomodoro_break",
    title: "Break time",
    body: "Take a 5 minute break.",
    data: { dateKey },
    targetDate: dateKey
  }).catch(() => {});

  return session;
}

export async function getPomodoroProgress(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<DayContent["planning"]> {
  const document = await loadDayDocument(userId, accessToken, dateKey);
  const content = normalizeDayContent(document.content as Record<string, unknown>);
  return content.planning;
}
