import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../server";
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

const createdUserIds: string[] = [];

async function registerUser(email: string, password: string) {
  const response = await request(app).post("/auth/register").send({ email, password });
  expect(response.status).toBe(201);
  const userId = response.body.data.user.id as string;
  const accessToken = response.body.data.session.access_token as string;
  createdUserIds.push(userId);
  return { userId, accessToken };
}

async function loginUser(email: string, password: string) {
  const response = await request(app).post("/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.session.access_token as string;
}

async function cleanupUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

const reflection = {
  wentWell: "Progress",
  whyWentWell: "Focus",
  repeatInFuture: "Plan earlier",
  wentWrong: "Distractions",
  whyWentWrong: "Too many pings",
  doDifferently: "Mute notifications"
};

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
      { title: "Task 1", description: "Desc 1", pomodorosPlanned: 1, pomodorosDone: 0 },
      { title: "Task 2", description: "Desc 2", pomodorosPlanned: 1, pomodorosDone: 0 },
      { title: "Task 3", description: "Desc 3", pomodorosPlanned: 1, pomodorosDone: 0 }
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
    reflection
  }
};

describe("mvp integration", () => {
  afterAll(async () => {
    await cleanupUsers();
  });

  it(
    "runs the complete user journey",
    async () => {
    const email = `hemera.mvp+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    const user = await registerUser(email, password);
    const authHeader = { Authorization: `Bearer ${user.accessToken}` };

    const todayKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");

    const quarterStart = await request(app)
      .post("/periods/quarter/start")
      .set(authHeader)
      .send({ startDate: "2026-01-01" });
    expect(quarterStart.status).toBe(200);
    const quarterKey = quarterStart.body.data.document.docKey as string;

    const lifeWheel = {
      work: 7,
      fun: 6,
      social: 5,
      giving: 6,
      money: 7,
      growth: 8,
      health: 7,
      love: 6
    };
    const lifeWheelResponse = await request(app)
      .patch(`/periods/quarter/${quarterKey}/life-wheel`)
      .set(authHeader)
      .send(lifeWheel);
    expect(lifeWheelResponse.status).toBe(200);

    const quarterGoals = [
      {
        title: "Goal 1",
        smartDefinition: "Specific",
        whatIsDifferent: "Change",
        consequencesIfNot: "Missed",
        rewardIfAchieved: "Celebrate"
      },
      {
        title: "Goal 2",
        smartDefinition: "Specific",
        whatIsDifferent: "Change",
        consequencesIfNot: "Missed",
        rewardIfAchieved: "Celebrate"
      },
      {
        title: "Goal 3",
        smartDefinition: "Specific",
        whatIsDifferent: "Change",
        consequencesIfNot: "Missed",
        rewardIfAchieved: "Celebrate"
      }
    ];
    const quarterGoalsResponse = await request(app)
      .put(`/periods/quarter/${quarterKey}/goals`)
      .set(authHeader)
      .send({ goals: quarterGoals });
    expect(quarterGoalsResponse.status).toBe(200);
    const quarterGoalIds = quarterGoalsResponse.body.data.document.content.quarterGoals.map((goal: any) => goal.id);

    const monthStart = await request(app)
      .post("/periods/month/start")
      .set(authHeader)
      .send({ monthKey: "2026-01" });
    expect(monthStart.status).toBe(200);

    const monthGoalsResponse = await request(app)
      .put("/periods/month/2026-01/goals")
      .set(authHeader)
      .send({
        goals: [
          {
            title: "Month goal",
            description: "Desc",
            linkedQuarterGoals: [quarterGoalIds[0]]
          }
        ]
      });
    expect(monthGoalsResponse.status).toBe(200);
    const monthGoalIds = monthGoalsResponse.body.data.document.content.monthlyGoals.map((goal: any) => goal.id);

    const weekStart = await request(app)
      .post("/periods/week/start")
      .set(authHeader)
      .send({ weekKey: "2026-W02" });
    expect(weekStart.status).toBe(200);

    const weekGoalsResponse = await request(app)
      .put("/periods/week/2026-W02/goals")
      .set(authHeader)
      .send({
        goals: [
          {
            title: "Week goal",
            description: "Desc",
            linkedMonthGoals: [monthGoalIds[0]]
          }
        ]
      });
    expect(weekGoalsResponse.status).toBe(200);

    const dayStartResponse = await request(app)
      .post(`/days/${todayKey}/start`)
      .set(authHeader)
      .send(validDayContent.dayStart);
    expect(dayStartResponse.status).toBe(200);

    const oneThingResponse = await request(app)
      .put(`/days/${todayKey}/planning/one-thing`)
      .set(authHeader)
      .send(validDayContent.planning.oneThing);
    expect(oneThingResponse.status).toBe(200);

    const topThreeResponse = await request(app)
      .put(`/days/${todayKey}/planning/top-three`)
      .set(authHeader)
      .send(validDayContent.planning.topThree);
    expect(topThreeResponse.status).toBe(200);

    const pomodoroStart = await request(app)
      .post(`/days/${todayKey}/pomodoro/start`)
      .set(authHeader)
      .send({ taskType: "oneThing" });
    expect(pomodoroStart.status).toBe(200);
    const sessionId = pomodoroStart.body.data.session.id as string;

    const pomodoroComplete = await request(app)
      .post(`/days/${todayKey}/pomodoro/${sessionId}/complete`)
      .set(authHeader);
    expect(pomodoroComplete.status).toBe(200);

    const pomodoroBreak = await request(app)
      .post(`/days/${todayKey}/pomodoro/${sessionId}/break`)
      .set(authHeader);
    expect(pomodoroBreak.status).toBe(200);

    const pillarsResponse = await request(app)
      .patch(`/days/${todayKey}/pillars`)
      .set(authHeader)
      .send(validDayContent.lifePillars);
    expect(pillarsResponse.status).toBe(200);

    const checklistResponse = await request(app)
      .patch(`/days/${todayKey}/close/checklist`)
      .set(authHeader)
      .send(validDayContent.dayClose);
    expect(checklistResponse.status).toBe(200);

    const reflectionResponse = await request(app)
      .put(`/days/${todayKey}/close/reflection`)
      .set(authHeader)
      .send(reflection);
    expect(reflectionResponse.status).toBe(200);

    const closeResponse = await request(app).post(`/days/${todayKey}/close`).set(authHeader);
    expect(closeResponse.status).toBe(200);
    expect(closeResponse.body.data.document.status).toBe("closed");

    const analyticsResponse = await request(app)
      .get(`/analytics/completion-rates?startDate=${todayKey}&endDate=${todayKey}`)
      .set(authHeader);
    expect(analyticsResponse.status).toBe(200);
  },
    30000
  );

  it("runs the offline sync journey", async () => {
    const email = `hemera.sync.mvp+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    const user = await registerUser(email, password);
    const authHeader = { Authorization: `Bearer ${user.accessToken}` };

    const dateKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");

    const pushResponse = await request(app)
      .post("/sync/push")
      .set(authHeader)
      .send({
        mutations: [
          {
            id: "mutation-1",
            docType: DocType.Day,
            docKey: dateKey,
            content: validDayContent,
            clientUpdatedAt: new Date().toISOString(),
            deviceId: "device-a",
            operation: "upsert"
          }
        ]
      });
    expect(pushResponse.status).toBe(200);

    const pullResponse = await request(app)
      .get("/sync/pull")
      .set(authHeader)
      .query({ since: "1970-01-01T00:00:00Z" });
    expect(pullResponse.status).toBe(200);
    expect(pullResponse.body.data.documents.length).toBeGreaterThan(0);
  });

  it("runs the accountability journey", async () => {
    const userAEmail = `hemera.partnerA+${Date.now()}@example.com`;
    const userBEmail = `hemera.partnerB+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    const userA = await registerUser(userAEmail, password);
    const userB = await registerUser(userBEmail, password);

    const authA = { Authorization: `Bearer ${userA.accessToken}` };
    const authB = { Authorization: `Bearer ${userB.accessToken}` };

    const requestResponse = await request(app)
      .post("/accountability/request")
      .set(authA)
      .send({ toUserEmail: userBEmail, toUserId: userB.userId });
    expect(requestResponse.status, requestResponse.body?.message ?? JSON.stringify(requestResponse.body)).toBe(200);

    const listResponse = await request(app).get("/accountability/requests").set(authB);
    expect(listResponse.status).toBe(200);
    const requestId = listResponse.body.data.requests[0].id as string;

    const acceptResponse = await request(app)
      .post(`/accountability/requests/${requestId}/accept`)
      .set(authB);
    expect(acceptResponse.status).toBe(200);

    const todayKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
    await request(app)
      .put(`/days/${todayKey}/close/reflection`)
      .set(authA)
      .send(reflection);
    const closeResponse = await request(app).post(`/days/${todayKey}/close`).set(authA);
    expect(closeResponse.status).toBe(200);

    const summaryResponse = await request(app)
      .get(`/accountability/partner/summary?startDate=${todayKey}&endDate=${todayKey}`)
      .set(authB);
    expect(summaryResponse.status).toBe(200);

    const checkinResponse = await request(app)
      .post("/accountability/checkin")
      .set(authB)
      .send({ message: "Keep going!" });
    expect(checkinResponse.status).toBe(200);
  });

  it("runs the admin journey", async () => {
    const adminEmail = `admin+${Date.now()}@example.com`;
    const adminPassword = "AdminPass!123";
    process.env.ADMIN_EMAILS = adminEmail;

    const { data, error } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? "Failed to create admin user");
    }
    createdUserIds.push(data.user.id);

    const adminToken = await loginUser(adminEmail, adminPassword);
    const authHeader = { Authorization: `Bearer ${adminToken}` };

    const targetEmail = `hemera.admin.target+${Date.now()}@example.com`;
    const targetPassword = "TargetPass!123";
    const createResponse = await request(app)
      .post("/admin/users")
      .set(authHeader)
      .send({ email: targetEmail, password: targetPassword });
    expect(createResponse.status).toBe(201);
    const targetUserId = createResponse.body.data.user.id as string;
    createdUserIds.push(targetUserId);

    const blockResponse = await request(app)
      .post(`/admin/users/${targetUserId}/block`)
      .set(authHeader);
    expect(blockResponse.status).toBe(200);

    const deleteResponse = await request(app)
      .delete(`/admin/users/${targetUserId}`)
      .set(authHeader);
    expect(deleteResponse.status).toBe(200);
  });
});
