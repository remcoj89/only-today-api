import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  getCalendarHeatmap,
  getCorrelations,
  getCurrentStreaks,
  getDayClosedRate,
  getDayCloseAdherence,
  getDayStartAdherence,
  getLifePillarAdherence,
  getPomodoroUtilization
} from "../analyticsService";
import { createUserSettings, updateUserSettings } from "../userService";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});
const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false }
});

const createdUserIds: string[] = [];

async function createUser() {
  const email = `hemera.analytics+${Date.now()}@example.com`;
  const password = "TestPassword!123";
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create test user");
  }
  createdUserIds.push(data.user.id);
  await createUserSettings(data.user.id);
  const signIn = await anonClient.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new Error(signIn.error?.message ?? "Failed to sign in test user");
  }
  return { userId: data.user.id, accessToken: signIn.data.session.access_token };
}

async function cleanupUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

async function upsertDayDocument(userId: string, dateKey: string, status: string, content: Record<string, unknown>) {
  await adminClient.from("journal_documents").upsert(
    {
      user_id: userId,
      doc_type: "day",
      doc_key: dateKey,
      status,
      content,
      client_updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,doc_type,doc_key" }
  );
}

async function upsertSummary(userId: string, date: string, dayClosed: boolean, oneThingDone: boolean, reflectionPresent: boolean) {
  await adminClient.from("daily_status_summary").upsert(
    {
      user_id: userId,
      date,
      day_closed: dayClosed,
      one_thing_done: oneThingDone,
      reflection_present: reflectionPresent,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,date" }
  );
}

describe("analyticsService", () => {
  let user: { userId: string; accessToken: string };

  beforeAll(async () => {
    user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, { timezone: "UTC" });

    const day1Content = {
      dayStart: {
        slept8Hours: true,
        water3Glasses: true,
        meditation5Min: true,
        mobility5Min: true,
        gratefulFor: "Focus",
        intentionForDay: "Ship"
      },
      planning: {
        oneThing: {
          title: "Main task",
          description: "Finish core work",
          pomodorosPlanned: 2,
          pomodorosDone: 2
        },
        topThree: [
          { title: "Task 1", description: "Desc 1", pomodorosPlanned: 1, pomodorosDone: 0 },
          { title: "Task 2", description: "Desc 2", pomodorosPlanned: 0, pomodorosDone: 0 },
          { title: "Task 3", description: "Desc 3", pomodorosPlanned: 0, pomodorosDone: 0 }
        ]
      },
      lifePillars: {
        training: { task: "", completed: true },
        deepRelaxation: { task: "", completed: true },
        healthyNutrition: { task: "", completed: true },
        realConnection: { task: "", completed: true }
      },
      dayClose: {
        noScreens2Hours: true,
        noCarbs3Hours: true,
        tomorrowPlanned: true,
        goalsReviewed: true,
        reflection: {
          wentWell: "Progress",
          whyWentWell: "Focus",
          repeatInFuture: "Plan earlier",
          wentWrong: "Distractions",
          whyWentWrong: "Too many pings",
          doDifferently: "Mute notifications"
        }
      }
    };

    const day2Content = {
      dayStart: {
        slept8Hours: true,
        water3Glasses: true,
        meditation5Min: true,
        mobility5Min: true,
        gratefulFor: "",
        intentionForDay: ""
      },
      planning: {
        oneThing: {
          title: "Small task",
          description: "Quick work",
          pomodorosPlanned: 1,
          pomodorosDone: 0
        },
        topThree: [
          { title: "Task 1", description: "Desc 1", pomodorosPlanned: 0, pomodorosDone: 0 },
          { title: "Task 2", description: "Desc 2", pomodorosPlanned: 0, pomodorosDone: 0 },
          { title: "Task 3", description: "Desc 3", pomodorosPlanned: 0, pomodorosDone: 0 }
        ]
      },
      lifePillars: {
        training: { task: "", completed: false },
        deepRelaxation: { task: "", completed: true },
        healthyNutrition: { task: "", completed: false },
        realConnection: { task: "", completed: true }
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

    const day0Content = {
      ...day1Content,
      dayStart: { ...day1Content.dayStart, gratefulFor: "Energy", intentionForDay: "Plan" }
    };

    await upsertDayDocument(user.userId, "2026-02-01", "closed", day1Content);
    await upsertDayDocument(user.userId, "2026-02-02", "open", day2Content);
    await upsertDayDocument(user.userId, "2026-01-31", "closed", day0Content);

    await upsertSummary(user.userId, "2026-02-01", true, true, true);
    await upsertSummary(user.userId, "2026-02-02", false, false, false);
    await upsertSummary(user.userId, "2026-01-31", true, true, true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("calculates completion rates", async () => {
    const range = { startDate: "2026-02-01", endDate: "2026-02-02" };
    const dayClosedRate = await getDayClosedRate(user.userId, user.accessToken, range);
    const dayStartAdherence = await getDayStartAdherence(user.userId, user.accessToken, range);
    const dayCloseAdherence = await getDayCloseAdherence(user.userId, user.accessToken, range);
    const lifePillarAdherence = await getLifePillarAdherence(user.userId, user.accessToken, range);

    expect(dayClosedRate).toBe(0.5);
    expect(dayStartAdherence).toBe(0.5);
    expect(dayCloseAdherence).toBe(0.5);
    expect(lifePillarAdherence.training).toBe(0.5);
  });

  it("calculates pomodoro utilization", async () => {
    const range = { startDate: "2026-02-01", endDate: "2026-02-02" };
    const stats = await getPomodoroUtilization(user.userId, user.accessToken, range);

    expect(stats.totals.planned).toBe(4);
    expect(stats.totals.done).toBe(2);
    expect(stats.byDay.length).toBe(2);
  });

  it("calculates streaks", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));

    const streaks = await getCurrentStreaks(user.userId, user.accessToken);
    expect(streaks.dayClosed).toBe(2);
    expect(streaks.allPillars).toBe(2);
    expect(streaks.perPillar.training).toBe(2);
  });

  it("calculates correlations", async () => {
    const range = { startDate: "2026-02-01", endDate: "2026-02-02" };
    const correlations = await getCorrelations(user.userId, user.accessToken, range);
    expect(correlations.dayStartComplete).toBe(1);
    expect(correlations.dayClosed).toBe(1);
    expect(correlations.both).toBe(1);
  });

  it("builds calendar heatmap data", async () => {
    const data = await getCalendarHeatmap(user.userId, user.accessToken, 2026);
    expect(data.find((entry) => entry.date === "2026-02-01")).toBeTruthy();
  });
});
