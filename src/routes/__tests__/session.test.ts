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

async function createTestUser(email: string, password: string) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create test user");
  }
  createdUserIds.push(data.user.id);
}

async function deleteCreatedUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

function createExpiredToken() {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString(
    "base64url"
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: "user", exp: Math.floor(Date.now() / 1000) - 60 }),
    "utf8"
  ).toString("base64url");
  return `${header}.${payload}.`;
}

describe("session management", () => {
  beforeAll(() => {
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await deleteCreatedUsers();
  });

  it("returns specific error for expired token", async () => {
    const expiredToken = createExpiredToken();
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Access token expired");
  });

  it("rate limits failed auth attempts", async () => {
    const invalidToken = "invalid.token.value";
    const clientIp = `203.0.113.${Math.floor(Math.random() * 200)}`;
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .get("/protected")
        .set("Authorization", `Bearer ${invalidToken}`)
        .set("x-forwarded-for", clientIp);
    }

    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${invalidToken}`)
      .set("x-forwarded-for", clientIp);

    expect(response.status).toBe(429);
    expect(response.body.code).toBe("RATE_LIMITED");
  });

  it("lists devices and revokes device session", async () => {
    const email = `hemera.session+${Date.now()}@example.com`;
    const password = "TestPassword!123";
    await createTestUser(email, password);

    const login = await request(app).post("/auth/login").send({ email, password });
    const accessToken = login.body.data.session.access_token as string;

    const listResponse = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("x-device-id", "device-1");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.devices).toEqual([
      expect.objectContaining({ deviceId: "device-1" })
    ]);

    const revokeResponse = await request(app)
      .delete("/devices/device-1")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(revokeResponse.status).toBe(200);

    const afterRevoke = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(afterRevoke.status).toBe(401);
    expect(afterRevoke.body.code).toBe("UNAUTHORIZED");
  });
});
