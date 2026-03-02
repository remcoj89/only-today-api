import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DocType } from "../../shared";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import { closeDay, getDocument, saveDocument } from "../documentService";
import {
  acceptPairRequest,
  createPairRequest,
  getPartnerSummary
} from "../accountabilityService";

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
      pomodorosDone: 2
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

async function createUser() {
  const email = `hemera.accountability.summary+${Date.now()}-${Math.random()}@example.com`;
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
  return { userId: data.user.id, accessToken: signIn.data.session.access_token, email };
}

async function cleanupUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

describe("accountabilityService partner summary", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("returns only allowed summary fields", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-04T10:00:00Z"));

    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const dateKey = "2026-02-04";
    await saveDocument(
      userA.userId,
      userA.accessToken,
      DocType.Day,
      dateKey,
      validDayContent,
      new Date().toISOString()
    );
    await closeDay(userA.userId, userA.accessToken, dateKey, validDayContent.dayClose.reflection);

    const summary = await getPartnerSummary(userB.userId, userB.accessToken, {
      startDate: dateKey,
      endDate: dateKey
    });

    expect(summary.length).toBe(1);
    expect(Object.keys(summary[0]).sort()).toEqual([
      "date",
      "dayClosed",
      "oneThingDone",
      "reflectionPresent"
    ]);
    expect(summary[0].dayClosed).toBe(true);
    expect(summary[0].oneThingDone).toBe(true);
    expect(summary[0].reflectionPresent).toBe(true);
  });

  it("prevents partner from accessing full documents directly", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-05T10:00:00Z"));

    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const dateKey = "2026-02-05";
    await saveDocument(
      userA.userId,
      userA.accessToken,
      DocType.Day,
      dateKey,
      validDayContent,
      new Date().toISOString()
    );

    await expect(
      getDocument(userA.userId, userB.accessToken, DocType.Day, dateKey)
    ).rejects.toBeInstanceOf(AppError);
  });
});
