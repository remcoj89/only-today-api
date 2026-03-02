import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { addDays, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocType } from "../../shared";
import { app } from "../../server";
import { createUserSettings } from "../../services/userService";

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
  const email = `hemera.sync.routes+${Date.now()}@example.com`;
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

describe("sync routes", () => {
  let user: { userId: string; accessToken: string };
  let todayKey: string;
  let yesterdayKey: string;

  beforeAll(async () => {
    user = await createUser();
    const now = new Date();
    todayKey = formatInTimeZone(now, "UTC", "yyyy-MM-dd");
    yesterdayKey = formatInTimeZone(subDays(now, 1), "UTC", "yyyy-MM-dd");
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("requires auth", async () => {
    const response = await request(app).post("/sync/push").send({ mutations: [] });
    expect(response.status).toBe(401);
  });

  it("processes push mutations", async () => {
    const response = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        mutations: [
          {
            id: "mutation-1",
            docType: DocType.Day,
            docKey: todayKey,
            content: validDayContent,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });

    expect(response.status).toBe(200);
    expect(response.body.data.results[0].success).toBe(true);
  });

  it("pulls changes since timestamp", async () => {
    const response = await request(app)
      .get(`/sync/pull?since=${encodeURIComponent("2026-02-01T00:00:00Z")}&docTypes=day`)
      .set("Authorization", `Bearer ${user.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.documents.length).toBeGreaterThan(0);
    expect(response.body.data.serverTime).toBeDefined();
  });

  it("supports full sync", async () => {
    const response = await request(app)
      .post("/sync/full")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        push: {
          mutations: [
            {
              id: "mutation-2",
              docType: DocType.Day,
            docKey: yesterdayKey,
              content: validDayContent,
              clientUpdatedAt: new Date().toISOString(),
              deviceId: "device-a",
              operation: "upsert"
            }
          ]
        },
        pullSince: "2026-02-01T00:00:00Z"
      });

    expect(response.status).toBe(200);
    expect(response.body.data.push.results.length).toBe(1);
    expect(response.body.data.pull.documents.length).toBeGreaterThan(0);
  });

  it("enforces push rate limits", async () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => {
      const dateKey = formatInTimeZone(addDays(new Date(), index), "UTC", "yyyy-MM-dd");
      return {
        id: `mutation-${index + 10}`,
        docType: DocType.Day,
        docKey: dateKey,
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "device-a",
        operation: "upsert"
      };
    });

    const response = await request(app)
      .post("/sync/push")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ mutations: tooMany });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe("RATE_LIMITED");
  });
});
