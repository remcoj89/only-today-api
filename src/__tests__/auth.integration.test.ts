import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../server";

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

async function createAdminUser() {
  const adminEmail = `hemera.admin.integration+${Date.now()}@example.com`;
  const adminPassword = "TestPassword!123";
  const { data, error } = await adminClient.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create admin user");
  }

  createdUserIds.push(data.user.id);
  process.env.ADMIN_EMAILS = adminEmail;

  return { adminEmail, adminPassword };
}

async function deleteCreatedUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

describe("auth integration flow", () => {
  beforeAll(() => {
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    await deleteCreatedUsers();
  });

  it("runs full user lifecycle", async () => {
    const { adminEmail, adminPassword } = await createAdminUser();

    const adminLogin = await request(app).post("/auth/login").send({
      email: adminEmail,
      password: adminPassword
    });
    const adminToken = adminLogin.body.data.session.access_token as string;

    const userEmail = `hemera.user.integration+${Date.now()}@example.com`;
    const userPassword = "TestPassword!123";

    const createUser = await request(app)
      .post("/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: userEmail, password: userPassword });

    expect(createUser.status).toBe(201);
    const userId = createUser.body.data.user.id as string;
    createdUserIds.push(userId);

    const login = await request(app).post("/auth/login").send({ email: userEmail, password: userPassword });
    expect(login.status).toBe(200);
    const accessTokenA = login.body.data.session.access_token as string;

    const updateSettings = await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .send({ timezone: "Europe/Amsterdam" });
    expect(updateSettings.status).toBe(200);

    await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .set("x-device-id", "device-1");

    await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessTokenA}`)
      .set("x-device-id", "device-2");

    const deviceList = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessTokenA}`);
    expect(deviceList.status).toBe(200);
    expect(deviceList.body.data.devices.length).toBeGreaterThanOrEqual(2);

    const revokeDevice = await request(app)
      .delete("/devices/device-1")
      .set("Authorization", `Bearer ${accessTokenA}`);
    expect(revokeDevice.status).toBe(200);

    const blockResponse = await request(app)
      .post(`/admin/users/${userId}/block`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(blockResponse.status).toBe(200);

    const blockedDevices = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessTokenA}`);
    // Blocked users krijgen 401 (niet 403) - security best practice om geen account status te lekken
    expect(blockedDevices.status).toBe(401);

    const unblockResponse = await request(app)
      .post(`/admin/users/${userId}/unblock`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unblockResponse.status).toBe(200);

    const relogin = await request(app).post("/auth/login").send({ email: userEmail, password: userPassword });
    expect(relogin.status).toBe(200);
    const accessTokenB = relogin.body.data.session.access_token as string;

    const unblockedDevices = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessTokenB}`);
    expect(unblockedDevices.status).toBe(200);

    const deleteResponse = await request(app)
      .delete(`/admin/users/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteResponse.status).toBe(200);

    const deletedDevices = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${accessTokenB}`);
    expect(deletedDevices.status).toBe(401);
  }, 30000);
});
