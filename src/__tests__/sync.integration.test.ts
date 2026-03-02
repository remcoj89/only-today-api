import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { addDays, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocType } from "../shared";
import { app } from "../server";
import { createUserSettings } from "../services/userService";

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
  const email = `hemera.sync.integration+${Date.now()}@example.com`;
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

const validDayContent = {
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
      pomodorosDone: 0
    },
    topThree: [
      {
        title: "Task 1",
        description: "Desc 1",
        pomodorosPlanned: 1,
        pomodorosDone: 0
      },
      {
        title: "Task 2",
        description: "Desc 2",
        pomodorosPlanned: 1,
        pomodorosDone: 0
      },
      {
        title: "Task 3",
        description: "Desc 3",
        pomodorosPlanned: 1,
        pomodorosDone: 0
      }
    ]
  },
  lifePillars: {
    training: { task: "", completed: false },
    deepRelaxation: { task: "", completed: true },
    healthyNutrition: { task: "", completed: true },
    realConnection: { task: "", completed: false }
  },
  dayClose: {
    noScreens2Hours: false,
    noCarbs3Hours: true,
    tomorrowPlanned: true,
    goalsReviewed: false,
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

describe("sync integration", () => {
  let user: { userId: string; accessToken: string };
  let todayKey: string;
  let yesterdayKey: string;
  let twoDaysAgoKey: string;

  beforeAll(async () => {
    user = await createUser();
    const now = new Date();
    todayKey = formatInTimeZone(now, "UTC", "yyyy-MM-dd");
    yesterdayKey = formatInTimeZone(subDays(now, 1), "UTC", "yyyy-MM-dd");
    twoDaysAgoKey = formatInTimeZone(subDays(now, 2), "UTC", "yyyy-MM-dd");
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("supports basic sync flow", async () => {
    const pushResponse = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-a",
            docType: DocType.Day,
            docKey: todayKey,
            content: validDayContent,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });

    expect(pushResponse.status).toBe(200);
    expect(pushResponse.body.data.results[0].success).toBe(true);

    const pullResponse = await request(app)
      .get(`/sync/pull?since=${encodeURIComponent("1970-01-01T00:00:00Z")}`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(pullResponse.status).toBe(200);
    expect(pullResponse.body.data.documents.length).toBeGreaterThan(0);
  });

  it("syncs offline batches", async () => {
    const pushResponse = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-b1",
            docType: DocType.Day,
            docKey: yesterdayKey,
            content: validDayContent,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          },
          {
            id: "mutation-b2",
            docType: DocType.Day,
            docKey: todayKey,
            content: validDayContent,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          },
          {
            id: "mutation-b3",
            docType: DocType.Day,
            docKey: twoDaysAgoKey,
            content: { ...validDayContent, planning: validDayContent.planning },
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });

    expect(pushResponse.status).toBe(200);
    expect(pushResponse.body.data.results.length).toBe(3);
  });

  it("handles conflict resolution with newer updates", async () => {
    const older = new Date(Date.now() - 60 * 1000).toISOString();
    const newer = new Date().toISOString();

    await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-c1",
            docType: DocType.Day,
            docKey: todayKey,
            content: validDayContent,
            clientUpdatedAt: older,
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });

    const response = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-c2",
            docType: DocType.Day,
            docKey: todayKey,
            content: { ...validDayContent, dayStart: { ...validDayContent.dayStart, slept8Hours: false } },
            clientUpdatedAt: newer,
            deviceId: "device-b",
            operation: "upsert"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].conflictResolution.winner).toBe("incoming");
  });

  it("rejects clock skewed mutations", async () => {
    const skewedTimestamp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const response = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-d1",
            docType: DocType.Day,
            docKey: todayKey,
            content: validDayContent,
            clientUpdatedAt: skewedTimestamp,
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].success).toBe(false);
    expect(response.body.data.results[0].error.code).toBe("CLOCK_SKEW_REJECTED");
  });

  it("returns partial batch success results", async () => {
    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        oneThing: { ...validDayContent.planning.oneThing, title: "" }
      }
    };

    const response = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-e1",
            docType: DocType.Day,
            docKey: todayKey,
            content: validDayContent,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          },
          {
            id: "mutation-e2",
            docType: DocType.Day,
            docKey: yesterdayKey,
            content: invalid,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });

    expect(response.status).toBe(200);
    const results = response.body.data.results;
    expect(results.find((result: { id: string }) => result.id === "mutation-e1").success).toBe(true);
    expect(results.find((result: { id: string }) => result.id === "mutation-e2").success).toBe(false);
  });
});
