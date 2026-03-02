import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { addDays, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../server";
import { createUserSettings } from "../services/userService";
import { autoClosePendingDays, getDocument } from "../services/documentService";
import { DocType } from "../shared";

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
  const email = `hemera.daily+${Date.now()}@example.com`;
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

describe("daily system integration", () => {
  let user: { userId: string; accessToken: string };
  let todayKey: string;
  let tomorrowKey: string;
  let yesterdayKey: string;
  let pastKey: string;

  beforeAll(async () => {
    user = await createUser();
    const now = new Date();
    todayKey = formatInTimeZone(now, "UTC", "yyyy-MM-dd");
    tomorrowKey = formatInTimeZone(addDays(now, 1), "UTC", "yyyy-MM-dd");
    yesterdayKey = formatInTimeZone(subDays(now, 1), "UTC", "yyyy-MM-dd");
    pastKey = formatInTimeZone(subDays(now, 3), "UTC", "yyyy-MM-dd");
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("runs the complete day flow", async () => {
    const statusResponse = await request(app)
      .get(`/days/${todayKey}/start/status`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data.status.complete).toBe(false);

    await request(app)
      .post(`/days/${todayKey}/start`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        slept8Hours: true,
        water3Glasses: true,
        meditation5Min: true,
        mobility5Min: true,
        gratefulFor: "Progress",
        intentionForDay: "Focus"
      })
      .expect(200);

    await request(app)
      .put(`/days/${todayKey}/planning/one-thing`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        title: "Main task",
        description: "Finish core work",
        pomodorosPlanned: 2
      })
      .expect(200);

    await request(app)
      .put(`/days/${todayKey}/planning/top-three`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send([
        { title: "Task 1", description: "Desc 1", pomodorosPlanned: 1 },
        { title: "Task 2", description: "Desc 2", pomodorosPlanned: 1 },
        { title: "Task 3", description: "Desc 3", pomodorosPlanned: 1 }
      ])
      .expect(200);

    await request(app)
      .patch(`/days/${todayKey}/pillars`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        training: true,
        deepRelaxation: false
      })
      .expect(200);

    const startResponse = await request(app)
      .post(`/days/${todayKey}/pomodoro/start`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ taskType: "oneThing" });
    expect(startResponse.status).toBe(200);
    const sessionId = startResponse.body.data.session.id as string;

    await request(app)
      .post(`/days/${todayKey}/pomodoro/${sessionId}/complete`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    await request(app)
      .post(`/days/${todayKey}/pomodoro/${sessionId}/break`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    const sessionResponse = await request(app)
      .post(`/days/${todayKey}/pomodoro/start`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ taskType: "oneThing" });
    const secondSessionId = sessionResponse.body.data.session.id as string;

    await request(app)
      .post(`/days/${todayKey}/pomodoro/${secondSessionId}/complete`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    await request(app)
      .patch(`/days/${todayKey}/close/checklist`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        noScreens2Hours: true,
        noCarbs3Hours: true,
        tomorrowPlanned: true,
        goalsReviewed: true
      })
      .expect(200);

    await request(app)
      .put(`/days/${todayKey}/close/reflection`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        wentWell: "Focus",
        whyWentWell: "Planning",
        repeatInFuture: "Start early",
        wentWrong: "Distractions",
        whyWentWrong: "Notifications",
        doDifferently: "Mute alerts"
      })
      .expect(200);

    const closeResponse = await request(app)
      .post(`/days/${todayKey}/close`)
      .set("Authorization", `Bearer ${user.accessToken}`);
    expect(closeResponse.status).toBe(200);
    expect(closeResponse.body.data.document.status).toBe("closed");

    const { data, error } = await adminClient
      .from("daily_status_summary")
      .select("*")
      .eq("user_id", user.userId)
      .eq("date", todayKey)
      .single();
    expect(error).toBeNull();
    expect(data?.day_closed).toBe(true);
  }, 30000);

  it("enforces workflow order for planning", async () => {
    const response = await request(app)
      .put(`/days/${tomorrowKey}/planning/one-thing`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        title: "Main task",
        description: "Finish core work",
        pomodorosPlanned: 1
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  }, 20000);

  it("auto-closes old days", async () => {
    await getDocument(user.userId, user.accessToken, DocType.Day, pastKey);
    const closed = await autoClosePendingDays(user.userId, user.accessToken);
    expect(closed).toBeGreaterThanOrEqual(1);
    const document = await getDocument(user.userId, user.accessToken, DocType.Day, pastKey);
    expect(document.status).toBe("auto_closed");
  }, 20000);

  it("prevents pomodoros beyond planned", async () => {
    await request(app)
      .post(`/days/${yesterdayKey}/start`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        slept8Hours: true,
        water3Glasses: true,
        meditation5Min: true,
        mobility5Min: true,
        gratefulFor: "Rest",
        intentionForDay: "Focus"
      })
      .expect(200);

    await request(app)
      .put(`/days/${yesterdayKey}/planning/one-thing`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        title: "Main task",
        description: "Finish core work",
        pomodorosPlanned: 1
      })
      .expect(200);

    const sessionResponse = await request(app)
      .post(`/days/${yesterdayKey}/pomodoro/start`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ taskType: "oneThing" });
    const sessionId = sessionResponse.body.data.session.id as string;

    await request(app)
      .post(`/days/${yesterdayKey}/pomodoro/${sessionId}/complete`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    const failResponse = await request(app)
      .post(`/days/${yesterdayKey}/pomodoro/start`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ taskType: "oneThing" });
    expect(failResponse.status).toBe(400);
    expect(failResponse.body.code).toBe("VALIDATION_ERROR");
  }, 20000);
});
