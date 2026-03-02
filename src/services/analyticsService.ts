import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import type { DayContent, DocumentBase, LifePillarsContent } from "../shared";
import { DocType } from "../shared";
import { config } from "../config";
import { AppError } from "../errors";
import { formatDateKey } from "../utils/dateUtils";
import { hasAllPillars as checkAllPillars, mergeLifePillars } from "../utils/lifePillars";
import { getUserSettings } from "./userService";
import { listDocuments } from "./documentService";

type DateRange = {
  startDate: string;
  endDate: string;
};

type SummaryRow = {
  date: string;
  day_closed: boolean;
  one_thing_done: boolean;
  reflection_present: boolean;
};

type PomodoroDayStats = {
  date: string;
  planned: number;
  done: number;
};

type PomodoroStats = {
  totals: { planned: number; done: number };
  byDay: PomodoroDayStats[];
};

function createAuthedClient(accessToken: string) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

function isDateInRange(dateKey: string, range: DateRange) {
  return dateKey >= range.startDate && dateKey <= range.endDate;
}

function normalizeDayContent(content: Record<string, unknown>): DayContent {
  const base: DayContent = {
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

function isDayStartComplete(content: DayContent) {
  return (
    content.dayStart.slept8Hours !== undefined &&
    content.dayStart.water3Glasses !== undefined &&
    content.dayStart.meditation5Min !== undefined &&
    content.dayStart.mobility5Min !== undefined &&
    content.dayStart.gratefulFor.length > 0 &&
    content.dayStart.intentionForDay.length > 0
  );
}

function isDayCloseChecklistComplete(content: DayContent) {
  return (
    content.dayClose.noScreens2Hours &&
    content.dayClose.noCarbs3Hours &&
    content.dayClose.tomorrowPlanned &&
    content.dayClose.goalsReviewed
  );
}

function sumPomodoros(content: DayContent) {
  const tasks = [
    content.planning.oneThing,
    ...content.planning.topThree,
    ...(content.planning.otherTasks ?? [])
  ];
  return tasks.reduce(
    (acc, task) => {
      acc.planned += task.pomodorosPlanned ?? 0;
      acc.done += task.pomodorosDone ?? 0;
      return acc;
    },
    { planned: 0, done: 0 }
  );
}

function hasAllPillars(pillars: LifePillarsContent) {
  return checkAllPillars(pillars);
}

async function loadSummaries(userId: string, accessToken: string, range: DateRange) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("daily_status_summary")
    .select("date,day_closed,one_thing_done,reflection_present")
    .eq("user_id", userId)
    .gte("date", range.startDate)
    .lte("date", range.endDate)
    .order("date", { ascending: true });

  if (error) {
    throw AppError.internal("Failed to load daily status summaries");
  }

  return (data ?? []) as SummaryRow[];
}

async function loadDayDocuments(userId: string, accessToken: string, range?: DateRange) {
  const documents = await listDocuments(userId, accessToken, { docType: DocType.Day });
  if (!range) {
    return documents;
  }
  return documents.filter((document) => isDateInRange(document.docKey, range));
}

export async function getDayClosedRate(userId: string, accessToken: string, range: DateRange) {
  const summaries = await loadSummaries(userId, accessToken, range);
  const total = summaries.length;
  const closed = summaries.filter((summary) => summary.day_closed).length;
  return total === 0 ? 0 : closed / total;
}

export async function getDayStartAdherence(userId: string, accessToken: string, range: DateRange) {
  const documents = await loadDayDocuments(userId, accessToken, range);
  const total = documents.length;
  const complete = documents.filter((document) => {
    const content = normalizeDayContent(document.content);
    return isDayStartComplete(content);
  }).length;
  return total === 0 ? 0 : complete / total;
}

export async function getDayCloseAdherence(userId: string, accessToken: string, range: DateRange) {
  const documents = await loadDayDocuments(userId, accessToken, range);
  const total = documents.length;
  const complete = documents.filter((document) => {
    const content = normalizeDayContent(document.content);
    return isDayCloseChecklistComplete(content);
  }).length;
  return total === 0 ? 0 : complete / total;
}

export async function getLifePillarAdherence(userId: string, accessToken: string, range: DateRange) {
  const documents = await loadDayDocuments(userId, accessToken, range);
  const total = documents.length;
  const counts = {
    training: 0,
    deepRelaxation: 0,
    healthyNutrition: 0,
    realConnection: 0
  };

  documents.forEach((document) => {
    const content = normalizeDayContent(document.content);
    if (content.lifePillars.training.completed) {
      counts.training += 1;
    }
    if (content.lifePillars.deepRelaxation.completed) {
      counts.deepRelaxation += 1;
    }
    if (content.lifePillars.healthyNutrition.completed) {
      counts.healthyNutrition += 1;
    }
    if (content.lifePillars.realConnection.completed) {
      counts.realConnection += 1;
    }
  });

  return {
    training: total === 0 ? 0 : counts.training / total,
    deepRelaxation: total === 0 ? 0 : counts.deepRelaxation / total,
    healthyNutrition: total === 0 ? 0 : counts.healthyNutrition / total,
    realConnection: total === 0 ? 0 : counts.realConnection / total
  };
}

export async function getPomodoroUtilization(userId: string, accessToken: string, range: DateRange): Promise<PomodoroStats> {
  const documents = await loadDayDocuments(userId, accessToken, range);
  const byDay = documents.map((document) => {
    const content = normalizeDayContent(document.content);
    const { planned, done } = sumPomodoros(content);
    return { date: document.docKey, planned, done };
  });

  const totals = byDay.reduce(
    (acc, entry) => {
      acc.planned += entry.planned;
      acc.done += entry.done;
      return acc;
    },
    { planned: 0, done: 0 }
  );

  return { totals, byDay };
}

export async function getCurrentStreaks(userId: string, accessToken: string) {
  const settings = await getUserSettings(userId, accessToken);
  const timeZone = settings.timezone ?? "UTC";
  const documents = await loadDayDocuments(userId, accessToken);
  const map = new Map(documents.map((document) => [document.docKey, document]));

  const computeStreak = (predicate: (content: DayContent, document: DocumentBase) => boolean) => {
    let streak = 0;
    for (let offset = 0; offset < 365; offset += 1) {
      const dateKey = formatDateKey(subDays(new Date(), offset), timeZone);
      const document = map.get(dateKey);
      if (!document) {
        break;
      }
      const content = normalizeDayContent(document.content);
      if (!predicate(content, document)) {
        break;
      }
      streak += 1;
    }
    return streak;
  };

  return {
    dayClosed: computeStreak((_content, document) => document.status === "closed"),
    allPillars: computeStreak((content) => hasAllPillars(content.lifePillars)),
    perPillar: {
      training: computeStreak((content) => content.lifePillars.training.completed),
      deepRelaxation: computeStreak((content) => content.lifePillars.deepRelaxation.completed),
      healthyNutrition: computeStreak((content) => content.lifePillars.healthyNutrition.completed),
      realConnection: computeStreak((content) => content.lifePillars.realConnection.completed)
    }
  };
}

export async function getCorrelations(userId: string, accessToken: string, range: DateRange) {
  const documents = await loadDayDocuments(userId, accessToken, range);
  let dayStartComplete = 0;
  let dayClosed = 0;
  let both = 0;

  documents.forEach((document) => {
    const content = normalizeDayContent(document.content);
    const startComplete = isDayStartComplete(content);
    const closed = document.status === "closed";
    if (startComplete) {
      dayStartComplete += 1;
    }
    if (closed) {
      dayClosed += 1;
    }
    if (startComplete && closed) {
      both += 1;
    }
  });

  return {
    dayStartComplete,
    dayClosed,
    both,
    dayStartToClosedRate: dayStartComplete === 0 ? 0 : both / dayStartComplete
  };
}

export async function getCalendarHeatmap(userId: string, accessToken: string, year: number) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const summaries = await loadSummaries(userId, accessToken, { startDate, endDate });

  return summaries.map((summary) => {
    const completionScore =
      (summary.day_closed ? 1 : 0) +
      (summary.one_thing_done ? 1 : 0) +
      (summary.reflection_present ? 1 : 0);
    return { date: summary.date, completionScore };
  });
}
