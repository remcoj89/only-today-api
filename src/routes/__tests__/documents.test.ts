import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { addDays, subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  const email = `hemera.routes+${Date.now()}@example.com`;
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

describe("documents routes", () => {
  let userA: { userId: string; accessToken: string };
  let userB: { userId: string; accessToken: string };
  let todayKey: string;
  let tomorrowKey: string;
  let futureKey: string;
  let pastKey: string;

  beforeAll(async () => {
    userA = await createUser();
    userB = await createUser();
    const now = new Date();
    todayKey = formatInTimeZone(now, "UTC", "yyyy-MM-dd");
    tomorrowKey = formatInTimeZone(addDays(now, 1), "UTC", "yyyy-MM-dd");
    futureKey = formatInTimeZone(addDays(now, 2), "UTC", "yyyy-MM-dd");
    pastKey = formatInTimeZone(subDays(now, 3), "UTC", "yyyy-MM-dd");
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("creates a new day document on GET", async () => {
    const response = await request(app)
      .get(`/documents/day/${tomorrowKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.document.docKey).toBe(tomorrowKey);
  });

  it("returns DOC_NOT_YET_AVAILABLE for unavailable day", async () => {
    const response = await request(app)
      .get(`/documents/day/${futureKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("DOC_NOT_YET_AVAILABLE");
  });

  it("saves valid document content", async () => {
    const response = await request(app)
      .put(`/documents/day/${todayKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString()
      });

    expect(response.status).toBe(200);
    expect(response.body.data.document.docKey).toBe(todayKey);
  });

  it("updates daily_status_summary when PUT includes status closed", async () => {
    const closedContent = {
      ...validDayContent,
      dayClose: {
        ...validDayContent.dayClose,
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
    const response = await request(app)
      .put(`/documents/day/${todayKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        content: closedContent,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "web",
        status: "closed"
      });

    expect(response.status).toBe(200);
    expect(response.body.data.document.status).toBe("closed");

    const { data } = await adminClient
      .from("daily_status_summary")
      .select("*")
      .eq("user_id", userA.userId)
      .eq("date", todayKey)
      .single();

    expect(data?.day_closed).toBe(true);
  });

  it("rejects invalid content (wrong structure)", async () => {
    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        topThree: validDayContent.planning.topThree.slice(0, 2)
      }
    };

    const response = await request(app)
      .put(`/documents/day/${todayKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        content: invalid,
        clientUpdatedAt: new Date().toISOString()
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects locked day edits", async () => {
    const response = await request(app)
      .put(`/documents/day/${pastKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString()
      });

    expect(response.status).toBe(423);
    expect(response.body.code).toBe("DOC_LOCKED");
  });

  it("rejects clock skewed updates", async () => {
    const skewedTimestamp = new Date(Date.now() + 11 * 60 * 1000).toISOString();
    const response = await request(app)
      .put(`/documents/day/${todayKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        content: validDayContent,
        clientUpdatedAt: skewedTimestamp
      });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("CLOCK_SKEW_REJECTED");
  });

  it("requires reflection for close", async () => {
    const response = await request(app)
      .post(`/documents/day/${todayKey}/close`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        reflection: {
          wentWell: "",
          whyWentWell: "",
          repeatInFuture: "",
          wentWrong: "",
          whyWentWrong: "",
          doDifferently: ""
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("lists only the user's documents", async () => {
    await request(app)
      .put(`/documents/day/${todayKey}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString()
      });

    await request(app)
      .put(`/documents/day/${tomorrowKey}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString()
      });

    const listResponse = await request(app)
      .get("/documents?docType=day")
      .set("Authorization", `Bearer ${userA.accessToken}`);

    expect(listResponse.status).toBe(200);
    const documents = listResponse.body.data.documents as { userId: string }[];
    expect(documents.every((doc) => doc.userId === userA.userId)).toBe(true);
  });
});
