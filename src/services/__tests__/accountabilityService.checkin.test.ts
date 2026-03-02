import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import {
  acceptPairRequest,
  createCheckin,
  createPairRequest,
  getCheckins,
  getTodayCheckin
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

async function createUser() {
  const email = `hemera.accountability.checkin+${Date.now()}-${Math.random()}@example.com`;
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

async function pairUsers() {
  const userA = await createUser();
  const userB = await createUser();
  const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
  await acceptPairRequest(userB.userId, userB.accessToken, request.id);
  return { userA, userB };
}

describe("accountabilityService check-ins", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("creates a check-in", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    const { userA } = await pairUsers();
    const checkin = await createCheckin(userA.userId, userA.accessToken, "You got this!");
    expect(checkin.message).toBe("You got this!");
  });

  it("rejects messages over 500 chars", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    const { userA } = await pairUsers();
    await expect(
      createCheckin(userA.userId, userA.accessToken, "a".repeat(501))
    ).rejects.toBeInstanceOf(AppError);
  });

  it("allows multiple check-ins per day for conversation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    const { userA } = await pairUsers();
    const first = await createCheckin(userA.userId, userA.accessToken, "First check-in");
    const second = await createCheckin(userA.userId, userA.accessToken, "Second check-in");
    expect(first.message).toBe("First check-in");
    expect(second.message).toBe("Second check-in");
    expect(first.id).not.toBe(second.id);
  });

  it("returns both sent and received check-ins", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    const { userA, userB } = await pairUsers();
    await createCheckin(userA.userId, userA.accessToken, "From A");
    await createCheckin(userB.userId, userB.accessToken, "From B");

    const checkins = await getCheckins(userA.userId, userA.accessToken, {
      startDate: "2026-02-06",
      endDate: "2026-02-06"
    });
    expect(checkins.length).toBe(2);
    expect(checkins.some((checkin) => checkin.authorUserId === userA.userId)).toBe(true);
    expect(checkins.some((checkin) => checkin.authorUserId === userB.userId)).toBe(true);
  });

  it("fails when user has no partner", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    const user = await createUser();
    await expect(
      createCheckin(user.userId, user.accessToken, "Hello")
    ).rejects.toBeInstanceOf(AppError);
  });

  it("reports today check-in status", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-06T10:00:00Z"));

    const { userA, userB } = await pairUsers();
    await createCheckin(userA.userId, userA.accessToken, "From A");

    const status = await getTodayCheckin(userB.userId, userB.accessToken);
    expect(status.sent).toBe(false);
    expect(status.received).toBe(true);
  });
});
