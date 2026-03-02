import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DocType, ErrorCode } from "../../shared";
import { createUserSettings } from "../userService";
import { saveDocument } from "../documentService";
import { getChangedDocuments, processPushMutations } from "../syncService";

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

async function createUser() {
  const email = `hemera.sync+${Date.now()}@example.com`;
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

describe("syncService", () => {
  let user: { userId: string; accessToken: string };

  beforeAll(async () => {
    user = await createUser();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes a single push mutation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));

    const results = await processPushMutations(user.userId, user.accessToken, [
      {
        id: "mutation-1",
        docType: DocType.Day,
        docKey: "2026-02-02",
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "device-a",
        operation: "upsert"
      }
    ]);

    expect(results[0].success).toBe(true);
  });

  it("returns partial results for invalid mutations", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-03T10:00:00Z"));

    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        oneThing: { ...validDayContent.planning.oneThing, title: "" }
      }
    };

    const results = await processPushMutations(user.userId, user.accessToken, [
      {
        id: "mutation-2",
        docType: DocType.Day,
        docKey: "2026-02-03",
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "device-a",
        operation: "upsert"
      },
      {
        id: "mutation-3",
        docType: DocType.Day,
        docKey: "2026-02-04",
        content: invalid,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "device-a",
        operation: "upsert"
      },
      {
        id: "mutation-4",
        docType: DocType.Day,
        docKey: "2026-02-05",
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "device-a",
        operation: "upsert"
      }
    ]);

    const invalidResult = results.find((result) => result.id === "mutation-3");
    expect(invalidResult?.success).toBe(false);
    expect(invalidResult?.error?.code).toBe(ErrorCode.ValidationError);
  });

  it("reports conflict resolution results", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      "2026-02-06",
      validDayContent,
      new Date().toISOString(),
      "device-a"
    );

    const olderTimestamp = new Date("2026-02-06T09:00:00Z").toISOString();
    const results = await processPushMutations(user.userId, user.accessToken, [
      {
        id: "mutation-5",
        docType: DocType.Day,
        docKey: "2026-02-06",
        content: validDayContent,
        clientUpdatedAt: olderTimestamp,
        deviceId: "device-b",
        operation: "upsert"
      }
    ]);

    expect(results[0].success).toBe(true);
    expect(results[0].conflictResolution?.winner).toBe("existing");
  });

  it("pulls changed documents since timestamp", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-07T10:00:00Z"));

    await processPushMutations(user.userId, user.accessToken, [
      {
        id: "mutation-6",
        docType: DocType.Day,
        docKey: "2026-02-07",
        content: validDayContent,
        clientUpdatedAt: new Date().toISOString(),
        deviceId: "device-a",
        operation: "upsert"
      }
    ]);

    const pull = await getChangedDocuments(user.userId, user.accessToken, "2026-02-07T00:00:00Z", [
      DocType.Day
    ]);

    expect(pull.documents.length).toBeGreaterThan(0);
    expect(pull.documents.every((doc) => doc.docType === DocType.Day)).toBe(true);
    expect(pull.serverTime).toBeDefined();
  });
});
