import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import { completeDayStart, setOneThing, setTopThree } from "../dayWorkflowService";
import {
  completePomodoro,
  getPomodoroProgress,
  startBreak,
  startPomodoro
} from "../pomodoroService";

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
  const email = `hemera.pomodoro+${Date.now()}@example.com`;
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

describe("pomodoroService", () => {
  let user: { userId: string; accessToken: string };
  let todayKey: string;

  beforeAll(async () => {
    user = await createUser();
    todayKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
    await completeDayStart(user.userId, user.accessToken, todayKey, {
      slept8Hours: true,
      water3Glasses: true,
      meditation5Min: true,
      mobility5Min: true,
      gratefulFor: "Focus",
      intentionForDay: "Momentum"
    });
    await setOneThing(user.userId, user.accessToken, todayKey, {
      title: "Main task",
      description: "Deep work",
      pomodorosPlanned: 2
    });
    await setTopThree(user.userId, user.accessToken, todayKey, [
      { title: "Task 1", description: "Desc 1", pomodorosPlanned: 1 },
      { title: "Task 2", description: "Desc 2", pomodorosPlanned: 1 },
      { title: "Task 3", description: "Desc 3", pomodorosPlanned: 1 }
    ]);
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("starts and completes pomodoros", async () => {
    const session = await startPomodoro(user.userId, user.accessToken, todayKey, "oneThing");
    expect(session.id).toBeTruthy();
    await startBreak(user.userId, todayKey, session.id);
    const document = await completePomodoro(user.userId, user.accessToken, todayKey, session.id);
    expect(document.docKey).toBe(todayKey);

    const progress = await getPomodoroProgress(user.userId, user.accessToken, todayKey);
    expect(progress.oneThing.pomodorosDone).toBe(1);
  });

  it("rejects invalid task references", async () => {
    await expect(
      startPomodoro(user.userId, user.accessToken, todayKey, "topThree", 9)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("prevents exceeding planned pomodoros", async () => {
    const session1 = await startPomodoro(user.userId, user.accessToken, todayKey, "oneThing");
    await completePomodoro(user.userId, user.accessToken, todayKey, session1.id);

    await expect(
      startPomodoro(user.userId, user.accessToken, todayKey, "oneThing")
    ).rejects.toBeInstanceOf(AppError);
  });
});
