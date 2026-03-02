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

async function deleteCreatedUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

describe("auth routes", () => {
  beforeAll(() => {
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await deleteCreatedUsers();
  });

  it("registers user and creates settings", async () => {
    const email = `hemera.register+${Date.now()}@example.com`;
    const password = "TestPassword!123";

    const response = await request(app).post("/auth/register").send({ email, password });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe(email);

    const userId = response.body.data.user.id as string;
    createdUserIds.push(userId);

    const { data: settings, error } = await adminClient
      .from("user_settings")
      .select("user_id")
      .eq("user_id", userId)
      .single();

    expect(error).toBeNull();
    expect(settings?.user_id).toBe(userId);
  });

  it("rejects registration with invalid email", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "not-an-email", password: "TestPassword!123" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("rejects registration with weak password", async () => {
    const response = await request(app)
      .post("/auth/register")
      .send({ email: "valid@example.com", password: "short" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials", async () => {
    const email = `hemera.login+${Date.now()}@example.com`;
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

    const response = await request(app).post("/auth/login").send({ email, password });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.session.access_token).toBeDefined();
  });

  it("rejects login with wrong password", async () => {
    const email = `hemera.badlogin+${Date.now()}@example.com`;
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

    const response = await request(app)
      .post("/auth/login")
      .send({ email, password: "WrongPassword!123" });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("refreshes session token", async () => {
    const email = `hemera.refresh+${Date.now()}@example.com`;
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

    const login = await request(app).post("/auth/login").send({ email, password });
    const refreshToken = login.body.data.session.refresh_token as string;

    const response = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.session.access_token).toBeDefined();
  });

  it("logout invalidates session", async () => {
    const email = `hemera.logout+${Date.now()}@example.com`;
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

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;
    const refreshToken = login.body.data.session.refresh_token as string;

    const logoutResponse = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(logoutResponse.status).toBe(200);

    const refreshResponse = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(refreshResponse.status).toBe(401);
  });

  it("accepts forgot-password for a valid email payload", async () => {
    const email = `hemera.forgot+${Date.now()}@example.com`;
    const response = await request(app).post("/auth/forgot-password").send({ email });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.message).toContain("reset link");
  });

  it("rejects forgot-password for invalid email", async () => {
    const response = await request(app).post("/auth/forgot-password").send({ email: "invalid-email" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});
