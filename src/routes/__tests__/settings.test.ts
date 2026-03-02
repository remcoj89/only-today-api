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
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const createdUserIds: string[] = [];

async function createTestUser(email: string, password: string) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create test user");
  }

  await adminClient.from("user_settings").insert({ user_id: data.user.id, timezone: "UTC" });
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

describe("settings routes", () => {
  beforeAll(() => {
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await deleteCreatedUsers();
  });

  it("returns 401 without auth", async () => {
    const response = await request(app).get("/settings");
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("returns user settings for authenticated user", async () => {
    const email = `hemera.settings+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.settings.user_id).toBeDefined();
  });

  it("updates only specified fields", async () => {
    const email = `hemera.settings.update+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ timezone: "Europe/Amsterdam" });

    expect(response.status).toBe(200);
    expect(response.body.data.settings.timezone).toBe("Europe/Amsterdam");
  });

  it("rejects invalid time format", async () => {
    const email = `hemera.settings.time+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ day_start_reminder_time: "99:99" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid timezone", async () => {
    const email = `hemera.settings.tz+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ timezone: "Not/AZone" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns profile for authenticated user", async () => {
    const email = `hemera.settings.profile+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .get("/settings/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.profile.email).toBe(email);
  });

  it("updates profile name in user metadata", async () => {
    const email = `hemera.settings.profile.update+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .patch("/settings/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Remco Test" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.profile.name).toBe("Remco Test");
  });

  it("rejects password update when body is invalid", async () => {
    const email = `hemera.settings.password+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .post("/settings/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword: "short", newPassword: "tiny" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("updates password with valid current password", async () => {
    const email = `hemera.settings.password.valid+${Date.now()}@example.com`;
    const currentPassword = "TestPassword!123";
    const newPassword = "NewPassword!123";
    await createTestUser(email, currentPassword);

    const login = await request(app).post("/auth/login").send({ email, password: currentPassword });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .post("/settings/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const loginWithNewPassword = await request(app).post("/auth/login").send({ email, password: newPassword });
    expect(loginWithNewPassword.status).toBe(200);
    expect(loginWithNewPassword.body.success).toBe(true);
  });

  it("rejects account delete without DELETE confirmation", async () => {
    const email = `hemera.settings.delete+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .delete("/settings/account")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ confirmation: "NOPE" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("deletes account with DELETE confirmation", async () => {
    const email = `hemera.settings.delete.valid+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const response = await request(app)
      .delete("/settings/account")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ confirmation: "DELETE" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.deleted).toBe(true);
  });

  it("prevents user from accessing another user's settings via RLS", async () => {
    const userAEmail = `hemera.settings.a+${Date.now()}@example.com`;
    const userBEmail = `hemera.settings.b+${Date.now()}@example.com`;
    const password = "TestPassword!123";

    const userA = await createTestUser(userAEmail, password);
    const userB = await createTestUser(userBEmail, password);

    const login = await request(app).post("/auth/login").send({ email: userAEmail, password });
    const accessToken = login.body.data.session.access_token as string;

    const authedClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });

    const { data, error } = await authedClient
      .from("user_settings")
      .select("user_id")
      .eq("user_id", userB.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
