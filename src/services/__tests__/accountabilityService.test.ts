import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import {
  acceptPairRequest,
  createPairRequest,
  getPartner,
  hasPendingRequest,
  listPairRequests,
  rejectPairRequest,
  removePair
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
  const email = `hemera.accountability+${Date.now()}-${Math.random()}@example.com`;
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

describe("accountabilityService pairing", () => {
  afterAll(async () => {
    await cleanupUsers();
  });

  it("creates a pairing request", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    expect(request.fromUserId).toBe(userA.userId);
    expect(request.toUserId).toBe(userB.userId);

    const hasPendingA = await hasPendingRequest(userA.userId, userA.accessToken);
    const hasPendingB = await hasPendingRequest(userB.userId, userB.accessToken);
    expect(hasPendingA).toBe(true);
    expect(hasPendingB).toBe(true);
  });

  it("rejects requests when already paired", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    await expect(
      createPairRequest(userA.userId, userA.accessToken, userB.email)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("accepts a pairing request and creates a pair", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const partnerA = await getPartner(userA.userId, userA.accessToken);
    const partnerB = await getPartner(userB.userId, userB.accessToken);
    expect(partnerA?.id).toBe(userB.userId);
    expect(partnerB?.id).toBe(userA.userId);
  });

  it("rejects a pairing request", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await rejectPairRequest(userB.userId, userB.accessToken, request.id);

    const requestsA = await listPairRequests(userA.userId, userA.accessToken);
    const requestsB = await listPairRequests(userB.userId, userB.accessToken);
    expect(requestsA.length).toBe(0);
    expect(requestsB.length).toBe(0);
  });

  it("removes a pair for both users", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const result = await removePair(userA.userId, userA.accessToken);
    expect(result.removed).toBe(true);

    const partnerA = await getPartner(userA.userId, userA.accessToken);
    const partnerB = await getPartner(userB.userId, userB.accessToken);
    expect(partnerA).toBeNull();
    expect(partnerB).toBeNull();
  });

  it("returns partner info with email", async () => {
    const userA = await createUser();
    const userB = await createUser();

    const request = await createPairRequest(userA.userId, userA.accessToken, userB.email);
    await acceptPairRequest(userB.userId, userB.accessToken, request.id);

    const partner = await getPartner(userA.userId, userA.accessToken);
    expect(partner?.id).toBe(userB.userId);
    expect(partner?.email).toBe(userB.email);
  });
});
