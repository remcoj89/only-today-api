import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { DocType } from "../../shared";
import { createDocumentRepository } from "../documentRepository";

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
  const email = `hemera.repo+${Date.now()}@example.com`;
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

describe("documentRepository", () => {
  let userA: { userId: string; accessToken: string };
  let userB: { userId: string; accessToken: string };

  beforeAll(async () => {
    userA = await createUser();
    userB = await createUser();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("creates and finds documents", async () => {
    const repo = createDocumentRepository(userA.accessToken);
    const docKey = `2026-02-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, "0")}`;

    const created = await repo.create({
      userId: userA.userId,
      docType: DocType.Day,
      docKey,
      status: "open",
      content: { foo: "bar" },
      clientUpdatedAt: new Date().toISOString()
    });

    const found = await repo.findByKey(userA.userId, DocType.Day, docKey);
    expect(found?.id).toBe(created.id);
    expect(found?.content).toEqual({ foo: "bar" });
  });

  it("lists only the user's documents", async () => {
    const repoA = createDocumentRepository(userA.accessToken);
    const repoB = createDocumentRepository(userB.accessToken);
    const docKeyA = `2026-03-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, "0")}`;
    const docKeyB = `2026-04-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, "0")}`;

    await repoA.create({
      userId: userA.userId,
      docType: DocType.Day,
      docKey: docKeyA,
      status: "open",
      content: { owner: "A" },
      clientUpdatedAt: new Date().toISOString()
    });

    await repoB.create({
      userId: userB.userId,
      docType: DocType.Day,
      docKey: docKeyB,
      status: "open",
      content: { owner: "B" },
      clientUpdatedAt: new Date().toISOString()
    });

    const results = await repoA.findByUser(userA.userId, { docType: DocType.Day });
    expect(results.every((doc) => doc.userId === userA.userId)).toBe(true);
    expect(results.find((doc) => doc.docKey === docKeyB)).toBeUndefined();
  });

  it("updates documents", async () => {
    const repo = createDocumentRepository(userA.accessToken);
    const docKey = `2026-05-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, "0")}`;

    const created = await repo.create({
      userId: userA.userId,
      docType: DocType.Day,
      docKey,
      status: "open",
      content: { value: 1 },
      clientUpdatedAt: new Date().toISOString()
    });

    const updated = await repo.update(created.id, {
      content: { value: 2 },
      clientUpdatedAt: new Date().toISOString()
    });

    expect(updated.content).toEqual({ value: 2 });
  });

  it("upserts documents", async () => {
    const repo = createDocumentRepository(userA.accessToken);
    const docKey = `2026-06-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, "0")}`;

    const created = await repo.upsert({
      userId: userA.userId,
      docType: DocType.Day,
      docKey,
      status: "open",
      content: { step: 1 },
      clientUpdatedAt: new Date().toISOString()
    });

    const updated = await repo.upsert({
      userId: userA.userId,
      docType: DocType.Day,
      docKey,
      status: "open",
      content: { step: 2 },
      clientUpdatedAt: new Date().toISOString()
    });

    expect(created.id).toBe(updated.id);
    expect(updated.content).toEqual({ step: 2 });
  });

  it("enforces RLS by returning no data for other users", async () => {
    const repoA = createDocumentRepository(userA.accessToken);

    const docKey = `2026-07-${Math.floor(Math.random() * 20 + 1).toString().padStart(2, "0")}`;
    await createDocumentRepository(userB.accessToken).create({
      userId: userB.userId,
      docType: DocType.Day,
      docKey,
      status: "open",
      content: { owner: "B" },
      clientUpdatedAt: new Date().toISOString()
    });

    const found = await repoA.findByKey(userB.userId, DocType.Day, docKey);
    expect(found).toBeNull();
  });
});
