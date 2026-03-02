import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DocType } from "../shared";
import { AppError } from "../errors";
import { createUserSettings } from "../services/userService";
import { closeDay, getDocument, saveDocument } from "../services/documentService";
import {
  acceptPairRequest,
  createCheckin,
  createPairRequest,
  getCheckins,
  getPartner,
  getPartnerSummary,
  listPairRequests,
  removePair
} from "../services/accountabilityService";

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
  const email = `hemera.accountability.integration+${Date.now()}-${Math.random()}@example.com`;
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

describe("accountability integration", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("handles full pairing flow", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-07T10:00:00Z"));

    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    const pending = await listPairRequests(userB.userId, userB.accessToken);
    expect(pending.length).toBe(1);

    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const partnerA = await getPartner(userA.userId, userA.accessToken);
    const partnerB = await getPartner(userB.userId, userB.accessToken);
    expect(partnerA?.id).toBe(userB.userId);
    expect(partnerB?.id).toBe(userA.userId);

    const dateKey = "2026-02-07";
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
    expect(summary[0].dayClosed).toBe(true);

    await createCheckin(userB.userId, userB.accessToken, "Nice work today");
    const checkins = await getCheckins(userA.userId, userA.accessToken, {
      startDate: dateKey,
      endDate: dateKey
    });
    expect(checkins.some((checkin) => checkin.authorUserId === userB.userId)).toBe(true);

    await removePair(userA.userId, userA.accessToken);
    expect(await getPartner(userA.userId, userA.accessToken)).toBeNull();
    expect(await getPartner(userB.userId, userB.accessToken)).toBeNull();
  });

  it("enforces privacy for partner summaries", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const dateKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
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
    expect(Object.keys(summary[0]).sort()).toEqual([
      "date",
      "dayClosed",
      "oneThingDone",
      "reflectionPresent"
    ]);

    await expect(
      getDocument(userA.userId, userB.accessToken, DocType.Day, dateKey)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("prevents pairing when user already has a partner", async () => {
    const userA = await createUser();
    const userB = await createUser();
    const userC = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    await expect(
      createPairRequest(userC.userId, userC.accessToken, userA.email)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("limits check-ins to one per day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-07T10:00:00Z"));

    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    await createCheckin(userA.userId, userA.accessToken, "First message");
    await expect(
      createCheckin(userA.userId, userA.accessToken, "Second message")
    ).rejects.toBeInstanceOf(AppError);
  });
});
