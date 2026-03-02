import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../../server";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const createdUserIds: string[] = [];

async function createUser(email: string, password: string) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create test user");
  }
  createdUserIds.push(data.user.id);
  return data.user;
}

async function deleteCreatedUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

describe("admin routes", () => {
  beforeAll(() => {
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await deleteCreatedUsers();
  });

  it("rejects non-admin user", async () => {
    const email = `hemera.user+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ email: "someone@example.com", password: "TestPassword!123" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });

  it("allows admin to create, block/unblock, and delete users", async () => {
    const adminEmail = `hemera.admin+${Date.now()}@example.com`;
    const adminPassword = "TestPassword!123";
    const adminUser = await createUser(adminEmail, adminPassword);
    process.env.ADMIN_EMAILS = adminEmail;

    const adminLogin = await request(app).post("/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });
    const adminToken = adminLogin.body.data.session.access_token as string;

    const newEmail = `hemera.created+${Date.now()}@example.com`;
    const createResponse = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: newEmail, password: "TestPassword!123" });

    expect(createResponse.status).toBe(201);
    const createdUserId = createResponse.body.data.user.id as string;
    createdUserIds.push(createdUserId);

    const logEntry = await adminClient
      .from("admin_user_actions")
      .select("action_type")
      .eq("admin_id", adminUser.id)
      .eq("target_user_id", createdUserId)
      .eq("action_type", "create")
      .maybeSingle();

    expect(logEntry.error).toBeNull();
    expect(logEntry.data?.action_type).toBe("create");

    const userLogin = await request(app)
      .post("/auth/login")
      .send({ email: newEmail, password: "TestPassword!123" });
    expect(userLogin.status).toBe(200);
    const userToken = userLogin.body.data.session.access_token as string;

    const blockResponse = await request(app)
      .post(`/admin/users/${createdUserId}/block`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(blockResponse.status).toBe(200);

    const blockedDevices = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${userToken}`);
    // Blocked users krijgen 401 (niet 403) - security best practice om geen account status te lekken
    expect(blockedDevices.status).toBe(401);

    const unblockResponse = await request(app)
      .post(`/admin/users/${createdUserId}/unblock`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unblockResponse.status).toBe(200);

    const unblockedDevices = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${userToken}`);
    expect(unblockedDevices.status).toBe(200);

    const deleteResponse = await request(app)
      .delete(`/admin/users/${createdUserId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteResponse.status).toBe(200);

    const { data: settings } = await adminClient
      .from("user_settings")
      .select("user_id")
      .eq("user_id", createdUserId)
      .maybeSingle();
    expect(settings).toBeNull();
  }, 30000);

  it("does not expose user documents endpoint", async () => {
    const adminEmail = `hemera.admin.docs+${Date.now()}@example.com`;
    const adminPassword = "TestPassword!123";
    await createUser(adminEmail, adminPassword);
    process.env.ADMIN_EMAILS = adminEmail;

    const adminLogin = await request(app).post("/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });
    const adminToken = adminLogin.body.data.session.access_token as string;

    const response = await request(app)
      .get("/admin/documents")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
